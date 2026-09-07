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
       * Explicitly enable or disable heading numbering. Enabling picks the
       * hierarchical ('nested') style; kept for backward compatibility.
       */
      setHeadingNumbering: (enabled: boolean) => ReturnType;
      /**
       * Set the heading numbering style explicitly:
       *   'off'    – no numbers,
       *   'nested' – hierarchical 1, 1.1, 1.1.1,
       *   'flat'   – a single running counter 1, 2, 3 across every heading,
       *   'legal'  – mixed outline 1, 1.a, 1.a.i (decimal / alpha / roman).
       */
      setHeadingNumberingMode: (mode: HeadingNumberingMode) => ReturnType;
      /**
       * Set the character(s) rendered AFTER each heading number (the delimiter
       * between the number and the heading text), e.g. '.' -> "1.1.", ')' ->
       * "1)". An empty string renders no trailing mark.
       */
      setHeadingNumberingDelimiter: (delimiter: string) => ReturnType;
      /**
       * Apply an EXACT mode + delimiter without toggling. Used to mirror the
       * page's persisted heading-numbering attribute into the live editor
       * (on load and whenever the page setting changes).
       */
      applyHeadingNumbering: (
        mode: HeadingNumberingMode,
        delimiter: string
      ) => ReturnType;
    };
  }
}

// The heading auto-numbering style. 'off' renders no numbers, 'nested' renders
// hierarchical numbers (1, 1.1, 1.1.1) driven by heading level, and 'flat'
// renders a single running counter (1, 2, 3) across every heading regardless of
// its level.
export type HeadingNumberingMode = 'off' | 'nested' | 'flat' | 'legal';

export interface HeadingEnhancementsStorage {
  // Session-level style: which numbering, if any, the plugin renders in front of
  // every top-level heading. Defaults to 'off' so existing documents are
  // unchanged.
  numberingMode: HeadingNumberingMode;
  // The character(s) appended after each computed number (between the number and
  // the heading text). Defaults to '.' for a nicer "1.1." look.
  delimiter: string;
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

// 1 -> 'a', 2 -> 'b', … 26 -> 'z', 27 -> 'aa' (spreadsheet-style base-26).
const toAlpha = (value: number): string => {
  let n = value;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(97 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || '1';
};

// 1 -> 'i', 4 -> 'iv', 9 -> 'ix' … (lowercase Roman numerals).
const toRoman = (value: number): string => {
  if (value <= 0) {
    return String(value);
  }
  const table: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let n = value;
  let out = '';
  for (const [num, sym] of table) {
    while (n >= num) {
      out += sym;
      n -= num;
    }
  }
  return out;
};

// Format one heading number for the given style. 'nested' joins every level
// counter with '.', 'legal' formats level 1 as a decimal, level 2 as lower
// alpha and level 3 as lower roman (1.a.i), also joined with '.'.
const formatNumber = (
  mode: HeadingNumberingMode,
  counters: number[],
  level: number
): string => {
  const parts = counters.slice(0, level);
  if (mode === 'legal') {
    return parts
      .map((count, index) => {
        if (index === 1) return toAlpha(count);
        if (index >= 2) return toRoman(count);
        return String(count);
      })
      .join('.');
  }
  return parts.join('.');
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
  numberingMode: HeadingNumberingMode,
  delimiter: string,
  toggle: (id: string) => void
): DecorationSet => {
  const tops: TopLevelNode[] = [];
  doc.forEach((node, offset) => {
    tops.push({ node, offset, level: HEADING_LEVELS[node.type.name] ?? 0 });
  });

  const decorations: Decoration[] = [];
  // Nested style: one counter per level. Flat style: a single running counter
  // (index 0) bumped for every heading whatever its level.
  const counters = [0, 0, 0];
  let flatCounter = 0;

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
    flatCounter += 1;

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

    if (numberingMode !== 'off') {
      const base =
        numberingMode === 'flat'
          ? String(flatCounter)
          : formatNumber(numberingMode, counters, level);
      const label = `${base}${delimiter}`;
      decorations.push(
        Decoration.widget(top.offset + 1, () => createNumber(label), {
          side: -1,
          key: `heading-number-${id}-${numberingMode}-${label}`,
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
      numberingMode: 'off',
      delimiter: '.',
    };
  },

  addCommands() {
    return {
      toggleHeadingNumbering:
        () =>
        ({ tr, dispatch }) => {
          // Cycle off <-> nested. Toggling from flat also turns it off.
          this.storage.numberingMode =
            this.storage.numberingMode === 'off' ? 'nested' : 'off';
          if (dispatch) {
            tr.setMeta(headingEnhancementsKey, { recompute: true });
            dispatch(tr);
          }
          return true;
        },
      setHeadingNumbering:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          this.storage.numberingMode = enabled ? 'nested' : 'off';
          if (dispatch) {
            tr.setMeta(headingEnhancementsKey, { recompute: true });
            dispatch(tr);
          }
          return true;
        },
      setHeadingNumberingMode:
        (mode: HeadingNumberingMode) =>
        ({ tr, dispatch }) => {
          // Choosing the mode already showing toggles it back off, so the same
          // slash command acts as an on/off switch for that style.
          this.storage.numberingMode =
            this.storage.numberingMode === mode ? 'off' : mode;
          if (dispatch) {
            tr.setMeta(headingEnhancementsKey, { recompute: true });
            dispatch(tr);
          }
          return true;
        },
      setHeadingNumberingDelimiter:
        (delimiter: string) =>
        ({ tr, dispatch }) => {
          this.storage.delimiter = delimiter;
          if (dispatch) {
            tr.setMeta(headingEnhancementsKey, { recompute: true });
            dispatch(tr);
          }
          return true;
        },
      applyHeadingNumbering:
        (mode: HeadingNumberingMode, delimiter: string) =>
        ({ tr, dispatch }) => {
          const changed =
            this.storage.numberingMode !== mode ||
            this.storage.delimiter !== delimiter;
          this.storage.numberingMode = mode;
          this.storage.delimiter = delimiter;
          // Only dispatch when something actually changed so the mirroring
          // effect is a no-op once the editor already matches the page attr.
          if (dispatch && changed) {
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
            buildDecorations(
              state.doc,
              storage.numberingMode,
              storage.delimiter,
              toggle
            ),
          apply: (tr, value, _oldState, newState) => {
            if (tr.docChanged || tr.getMeta(headingEnhancementsKey)) {
              return buildDecorations(
                newState.doc,
                storage.numberingMode,
                storage.delimiter,
                toggle
              );
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
