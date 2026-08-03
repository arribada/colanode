// ABOUTME: TipTap extension that augments h1/h2/h3 with optional hierarchical
// ABOUTME: auto-numbering (display-only) and Notion-style collapsible sections.
import { Extension } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { defaultClasses } from '@colanode/ui/editor/classes';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingEnhancements: {
      /**
       * Toggle document-wide hierarchical heading numbering (1, 1.1, 1.1.1).
       * The numbering is rendered as decorations only; the document content is
       * never mutated.
       */
      toggleHeadingNumbering: () => ReturnType;
      /**
       * Explicitly enable or disable heading numbering.
       */
      setHeadingNumbering: (enabled: boolean) => ReturnType;
    };
  }
}

export interface HeadingEnhancementsStorage {
  // Session-level flag: when true the plugin renders hierarchical numbers in
  // front of every top-level heading. Defaults to off so existing documents are
  // unchanged.
  numbering: boolean;
}

export const headingEnhancementsKey = new PluginKey<DecorationSet>(
  'heading-enhancements'
);

// Maps the three distinct heading node types to their nesting level. Any other
// node type resolves to 0 (not a heading).
const HEADING_LEVELS: Record<string, number> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
};

const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

// Finds the document position of the top-level heading carrying the given block
// id, resolved against the *current* document so the collapse toggle stays
// correct even after the decoration that created the chevron went stale.
const findHeadingPosById = (
  doc: ProseMirrorNode,
  id: string
): number | null => {
  let found: number | null = null;
  doc.forEach((node, offset) => {
    if (
      found === null &&
      HEADING_LEVELS[node.type.name] &&
      node.attrs.id === id
    ) {
      found = offset;
    }
  });
  return found;
};

const createChevron = (
  collapsed: boolean,
  id: string,
  toggle: (id: string) => void
): HTMLElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.contentEditable = 'false';
  button.setAttribute('data-heading-collapse', 'true');
  button.setAttribute(
    'aria-label',
    collapsed ? 'Expand section' : 'Collapse section'
  );
  button.className = collapsed
    ? `${defaultClasses.headingChevron} ${defaultClasses.headingChevronCollapsed}`
    : defaultClasses.headingChevron;
  button.innerHTML = chevronSvg;
  // Right-pointing when collapsed, rotated down when expanded.
  button.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(90deg)';

  const handler = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle(id);
  };
  // mousedown (not click) so the editor never places a caret before toggling.
  button.addEventListener('mousedown', handler);

  return button;
};

const createNumber = (label: string): HTMLElement => {
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.className = defaultClasses.headingNumber;
  span.textContent = label;
  return span;
};

interface TopLevelNode {
  node: ProseMirrorNode;
  offset: number;
  level: number;
}

// Scans the top-level blocks in document order and emits, for every heading:
//   - a chevron widget to fold the section,
//   - (when numbering is on) a computed number widget,
//   - node decorations that hide the following blocks while it is collapsed.
// Counters are driven purely by the heading level sequence, so out-of-order
// headings still produce a stable, monotonic outline.
const buildDecorations = (
  doc: ProseMirrorNode,
  numbering: boolean,
  toggle: (id: string) => void
): DecorationSet => {
  const tops: TopLevelNode[] = [];
  doc.forEach((node, offset) => {
    tops.push({ node, offset, level: HEADING_LEVELS[node.type.name] ?? 0 });
  });

  const decorations: Decoration[] = [];
  const counters = [0, 0, 0];

  for (let i = 0; i < tops.length; i++) {
    const top = tops[i];
    if (!top || top.level === 0) {
      continue;
    }

    const level = top.level;
    const id = typeof top.node.attrs.id === 'string' ? top.node.attrs.id : '';
    const collapsed = top.node.attrs.collapsed === true;

    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    for (let l = level; l < counters.length; l++) {
      counters[l] = 0;
    }

    // Chevron first so it sits in the left gutter, ahead of the number/text.
    decorations.push(
      Decoration.widget(
        top.offset + 1,
        () => createChevron(collapsed, id, toggle),
        {
          side: -1,
          key: `heading-chevron-${id}-${collapsed ? 'c' : 'e'}`,
        }
      )
    );

    if (numbering) {
      const label = counters.slice(0, level).join('.');
      decorations.push(
        Decoration.widget(top.offset + 1, () => createNumber(label), {
          side: -1,
          key: `heading-number-${id}-${label}`,
        })
      );
    }

    if (collapsed) {
      for (let j = i + 1; j < tops.length; j++) {
        const next = tops[j];
        if (!next) {
          break;
        }
        // Stop at the next heading of the same or higher level; everything in
        // between (deeper headings and their content) belongs to this section.
        if (next.level !== 0 && next.level <= level) {
          break;
        }
        decorations.push(
          Decoration.node(next.offset, next.offset + next.node.nodeSize, {
            class: defaultClasses.headingCollapsedHidden,
          })
        );
      }
    }
  }

  return DecorationSet.create(doc, decorations);
};

export const HeadingEnhancementsExtension = Extension.create<
  Record<string, never>,
  HeadingEnhancementsStorage
>({
  name: 'headingEnhancements',

  addStorage() {
    return {
      numbering: false,
    };
  },

  addCommands() {
    return {
      toggleHeadingNumbering:
        () =>
        ({ tr, dispatch }) => {
          this.storage.numbering = !this.storage.numbering;
          if (dispatch) {
            tr.setMeta(headingEnhancementsKey, { recompute: true });
            dispatch(tr);
          }
          return true;
        },
      setHeadingNumbering:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          this.storage.numbering = enabled;
          if (dispatch) {
            tr.setMeta(headingEnhancementsKey, { recompute: true });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const editor = this.editor;

    const toggle = (id: string) => {
      const pos = findHeadingPosById(editor.state.doc, id);
      if (pos === null) {
        return;
      }
      const node = editor.state.doc.nodeAt(pos);
      if (!node) {
        return;
      }
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          collapsed: !(node.attrs.collapsed === true),
        })
      );
    };

    return [
      new Plugin<DecorationSet>({
        key: headingEnhancementsKey,
        state: {
          init: (_config, state) =>
            buildDecorations(state.doc, storage.numbering, toggle),
          apply: (tr, value, _oldState, newState) => {
            if (tr.docChanged || tr.getMeta(headingEnhancementsKey)) {
              return buildDecorations(newState.doc, storage.numbering, toggle);
            }
            return value.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return headingEnhancementsKey.getState(state);
          },
        },
      }),
    ];
  },
});
