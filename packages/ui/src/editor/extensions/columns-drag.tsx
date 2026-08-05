// ABOUTME: Notion-style "drag a block onto another block's side to make
// ABOUTME: columns" — a conservative ProseMirror plugin that falls back to the
// ABOUTME: default vertical drop whenever anything is uncertain (never corrupts).
import { Extension } from '@tiptap/core';
import { Fragment, Node as PMNode, Slice } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';

// Fraction of a block's width, on each edge, that arms a side-drop. Inside the
// middle band we do nothing and let the normal (vertical) drop run.
const EDGE = 0.32;
const COLUMNS = 'columns';
const COLUMN = 'column';

type Side = 'left' | 'right';

// Where the current drag would land, computed on dragover and read on drop.
// Kept on a mutable closure (not plugin state) so hover updates don't spam the
// document with transactions — same trick the built-in dropcursor uses.
interface DropTarget {
  side: Side;
  // Wrap mode: replace this top-level block range with a 2-column layout.
  wrapStart: number;
  wrapEnd: number;
  // Insert mode: the block is already inside a `columns` node — add a column.
  columns: boolean;
  columnInsertPos: number;
  // Screen rect + x used to draw the indicator bar.
  rect: DOMRect;
}

const key = new PluginKey('columnsDrag');

const topLevelBlockAt = (view: EditorView, x: number, y: number) => {
  const posInfo = view.posAtCoords({ left: x, top: y });
  if (!posInfo) {
    return null;
  }

  const $pos = view.state.doc.resolve(
    posInfo.inside >= 0 ? posInfo.inside : posInfo.pos
  );
  if ($pos.depth < 1) {
    return null;
  }

  const start = $pos.before(1);
  const node = view.state.doc.nodeAt(start);
  if (!node) {
    return null;
  }

  const dom = view.nodeDOM(start);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }

  return { $pos, start, end: $pos.after(1), node, dom };
};

export const ColumnsDragExtension = Extension.create({
  name: 'columnsDrag',

  addProseMirrorPlugins() {
    let target: DropTarget | null = null;
    let indicator: HTMLElement | null = null;

    const hide = () => {
      target = null;
      if (indicator) {
        indicator.style.display = 'none';
      }
    };

    const showIndicator = (view: EditorView, t: DropTarget) => {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'columns-drop-indicator';
        indicator.style.cssText =
          'position:fixed;z-index:50;width:3px;border-radius:3px;background:#3b82f6;pointer-events:none;box-shadow:0 0 0 1px rgba(59,130,246,0.35);';
        document.body.appendChild(indicator);
      }
      const pad = 2;
      indicator.style.display = 'block';
      indicator.style.top = `${t.rect.top + pad}px`;
      indicator.style.height = `${Math.max(0, t.rect.height - pad * 2)}px`;
      indicator.style.left =
        t.side === 'left'
          ? `${t.rect.left - 1}px`
          : `${t.rect.right - 2}px`;
    };

    return [
      new Plugin({
        key,
        view() {
          return {
            destroy() {
              if (indicator && indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
              }
              indicator = null;
              target = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            dragover: (view, event) => {
              // Only meaningful while an internal block is being dragged.
              if (!view.dragging) {
                hide();
                return false;
              }

              const hit = topLevelBlockAt(
                view,
                event.clientX,
                event.clientY
              );
              if (!hit) {
                hide();
                return false;
              }

              const rect = hit.dom.getBoundingClientRect();
              const edge = rect.width * EDGE;
              let side: Side | null = null;
              if (event.clientX <= rect.left + edge) {
                side = 'left';
              } else if (event.clientX >= rect.right - edge) {
                side = 'right';
              }

              if (!side) {
                hide();
                return false;
              }

              // Case A: the block already sits in a `columns` layout → we will
              // add a new column next to the hovered one.
              if (hit.node.type.name === COLUMNS) {
                const colIndex = hit.$pos.depth >= 2 ? hit.$pos.index(1) : 0;
                const columnsNode = hit.node;
                let posInside = hit.start + 1; // just inside <columns>
                for (let i = 0; i < colIndex; i += 1) {
                  posInside += columnsNode.child(i).nodeSize;
                }
                const insertPos =
                  side === 'left'
                    ? posInside
                    : posInside + columnsNode.child(colIndex).nodeSize;
                target = {
                  side,
                  wrapStart: hit.start,
                  wrapEnd: hit.end,
                  columns: true,
                  columnInsertPos: insertPos,
                  rect,
                };
              } else {
                // Case B: a normal top-level block → wrap it + the dragged
                // block into a fresh two-column layout.
                target = {
                  side,
                  wrapStart: hit.start,
                  wrapEnd: hit.end,
                  columns: false,
                  columnInsertPos: -1,
                  rect,
                };
              }

              showIndicator(view, target);
              // Claim the drag so the browser shows a move cursor here.
              event.preventDefault();
              return true;
            },
            dragleave: (_view, event) => {
              // Only hide when the pointer actually leaves the editor, not when
              // it crosses between child nodes.
              if (!event.relatedTarget) {
                hide();
              }
              return false;
            },
            dragend: () => {
              hide();
              return false;
            },
            drop: (view, event) => {
              const t = target;
              hide();
              if (!t) {
                return false; // let the default vertical drop run
              }

              const schema = view.state.schema;
              if (!schema.nodes[COLUMNS] || !schema.nodes[COLUMN]) {
                return false;
              }

              // Reconstruct the dragged slice. Prefer the live internal drag
              // (keeps node ids/attrs); fall back to the event slice.
              const dragging = view.dragging;
              const slice: Slice | null = dragging?.slice ?? null;
              if (!slice || slice.content.childCount === 0) {
                return false;
              }

              const draggedNodes: PMNode[] = [];
              slice.content.forEach((n) => draggedNodes.push(n));
              // Columns hold block content only; bail on inline/text drags.
              if (draggedNodes.some((n) => n.isInline || n.isText)) {
                return false;
              }

              // Source range of a move, so we can remove the original.
              const moved = dragging?.move ?? false;
              let sourceFrom = -1;
              let sourceTo = -1;
              if (moved && view.state.selection instanceof NodeSelection) {
                sourceFrom = view.state.selection.from;
                sourceTo = view.state.selection.to;
              }

              // Guard: never drop a block onto (a part of) itself.
              if (
                sourceFrom >= 0 &&
                t.wrapStart >= sourceFrom &&
                t.wrapEnd <= sourceTo
              ) {
                return false;
              }

              event.preventDefault();

              try {
                const tr = view.state.tr;

                // Capture the target block BEFORE any edit (wrap mode needs it).
                const targetNode = t.columns
                  ? null
                  : view.state.doc.nodeAt(t.wrapStart);
                if (!t.columns && !targetNode) {
                  return false;
                }

                if (moved && sourceFrom >= 0) {
                  tr.delete(sourceFrom, sourceTo);
                }

                if (t.columns) {
                  const insertAt = tr.mapping.map(t.columnInsertPos);
                  const column = schema.nodes[COLUMN].createChecked(
                    null,
                    Fragment.fromArray(draggedNodes)
                  );
                  tr.insert(insertAt, column);
                } else {
                  const start = tr.mapping.map(t.wrapStart);
                  const end = tr.mapping.map(t.wrapEnd);
                  const keptColumn = schema.nodes[COLUMN].createChecked(
                    null,
                    Fragment.from(targetNode as PMNode)
                  );
                  const newColumn = schema.nodes[COLUMN].createChecked(
                    null,
                    Fragment.fromArray(draggedNodes)
                  );
                  const columnsNode = schema.nodes[COLUMNS].createChecked(
                    null,
                    t.side === 'left'
                      ? [newColumn, keptColumn]
                      : [keptColumn, newColumn]
                  );
                  tr.replaceRangeWith(start, end, columnsNode);
                }

                // Clear the internal drag so PM's default handler doesn't also
                // delete the source (we already did) or re-insert the slice.
                view.dragging = null;
                view.dispatch(tr.scrollIntoView());
                return true;
              } catch {
                // Any schema/position surprise → abort to the safe default.
                return false;
              }
            },
          },
        },
      }),
    ];
  },
});
