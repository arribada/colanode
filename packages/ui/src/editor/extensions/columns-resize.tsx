// ABOUTME: Drag-to-resize handles between columns — widget decorations placed
// ABOUTME: between adjacent `column` nodes that trade their flex-grow `width`.
import { Extension } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';

const key = new PluginKey('columnsResize');
const MIN = 0.2; // a column can never shrink below this flex weight

const buildHandle = (
  view: EditorView,
  leftPos: number,
  rightPos: number
): HTMLElement => {
  const handle = document.createElement('div');
  handle.className = 'column-resize-handle';
  handle.setAttribute('contenteditable', 'false');
  handle.style.cssText =
    'flex:0 0 12px;align-self:stretch;cursor:col-resize;position:relative;user-select:none;';
  // A thin line, centered in the 12px hit area, that brightens on hover/drag.
  const line = document.createElement('div');
  line.style.cssText =
    'position:absolute;top:0;bottom:0;left:50%;width:2px;transform:translateX(-50%);border-radius:2px;background:transparent;transition:background 0.12s;';
  handle.appendChild(line);
  handle.addEventListener('mouseenter', () => {
    line.style.background = '#93c5fd';
  });
  handle.addEventListener('mouseleave', () => {
    line.style.background = 'transparent';
  });

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const leftNode = view.state.doc.nodeAt(leftPos);
    const rightNode = view.state.doc.nodeAt(rightPos);
    if (
      !leftNode ||
      !rightNode ||
      leftNode.type.name !== 'column' ||
      rightNode.type.name !== 'column'
    ) {
      return;
    }

    const container = handle.parentElement;
    if (!container) {
      return;
    }

    const totalPx = container.getBoundingClientRect().width || 1;
    const wLeft = (leftNode.attrs.width as number) ?? 1;
    const wRight = (rightNode.attrs.width as number) ?? 1;
    const sum = wLeft + wRight;
    const startX = event.clientX;

    line.style.background = '#3b82f6';
    document.body.style.cursor = 'col-resize';

    let raf = 0;
    let pending: { l: number; r: number } | null = null;

    const flush = () => {
      raf = 0;
      if (!pending) {
        return;
      }
      // Re-check the nodes live: attr-only edits keep node sizes (and thus
      // leftPos/rightPos) stable across the whole drag.
      const l = view.state.doc.nodeAt(leftPos);
      const r = view.state.doc.nodeAt(rightPos);
      if (!l || !r || l.type.name !== 'column' || r.type.name !== 'column') {
        return;
      }
      const tr = view.state.tr
        .setNodeAttribute(leftPos, 'width', pending.l)
        .setNodeAttribute(rightPos, 'width', pending.r)
        .setMeta('addToHistory', false);
      view.dispatch(tr);
      pending = null;
    };

    const onMove = (e: PointerEvent) => {
      const deltaFrac = ((e.clientX - startX) / totalPx) * sum;
      let l = wLeft + deltaFrac;
      l = Math.max(MIN, Math.min(sum - MIN, l));
      pending = { l, r: sum - l };
      if (!raf) {
        raf = requestAnimationFrame(flush);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      line.style.background = 'transparent';
      if (raf) {
        cancelAnimationFrame(raf);
      }
      flush();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  return handle;
};

const buildDecorations = (doc: PMNode): DecorationSet => {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'columns' || node.childCount < 2) {
      return;
    }
    let offset = pos + 1; // first position inside <columns>
    for (let i = 0; i < node.childCount - 1; i += 1) {
      const leftPos = offset;
      const rightPos = offset + node.child(i).nodeSize;
      decorations.push(
        Decoration.widget(
          rightPos,
          (view) => buildHandle(view, leftPos, rightPos),
          { side: 0, ignoreSelection: true, key: `col-resize-${leftPos}` }
        )
      );
      offset = rightPos;
    }
  });
  return DecorationSet.create(doc, decorations);
};

export const ColumnsResizeExtension = Extension.create({
  name: 'columnsResize',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            return buildDecorations(state.doc);
          },
        },
      }),
    ];
  },
});
