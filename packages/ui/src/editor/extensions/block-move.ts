// ABOUTME: Moves a block one step up or down among its siblings, from the
// ABOUTME: block menu or with Alt+Arrow, so a block can be reordered without a drag.
import { Extension } from '@tiptap/core';
import {
  NodeSelection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';

import {
  innerHandleTarget,
  type PathStep,
} from '@colanode/ui/editor/menus/block-target';

export type MoveDirection = 'up' | 'down';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockMove: {
      // Move the block that starts at `pos` one step among its siblings.
      moveBlockAt: (pos: number, direction: MoveDirection) => ReturnType;
      // Move the block that holds the selection (the one the block handle
      // would target) one step among its siblings.
      moveSelectedBlock: (direction: MoveDirection) => ReturnType;
    };
  }
}

// Swaps the block starting at `pos` with its previous or next sibling, in
// place in `tr`. Returns the block's new start position, or null when `pos`
// is not the start of a block or the block has no sibling on that side. Pure
// over the transaction: no selection change, no scroll.
export const moveBlock = (
  tr: Transaction,
  pos: number,
  direction: MoveDirection
): number | null => {
  const doc = tr.doc;
  if (pos < 0 || pos >= doc.content.size) {
    return null;
  }
  const node = doc.nodeAt(pos);
  if (!node || !node.isBlock) {
    return null;
  }
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const index = $pos.index();
  if (parent.maybeChild(index) !== node) {
    return null;
  }

  if (direction === 'up') {
    if (index === 0) {
      return null;
    }
    const previous = parent.child(index - 1);
    const target = pos - previous.nodeSize;
    tr.delete(pos, pos + node.nodeSize);
    tr.insert(target, node);
    return target;
  }

  if (index >= parent.childCount - 1) {
    return null;
  }
  const next = parent.child(index + 1);
  // The block leaves first, so its old span no longer shifts the spot after
  // the next sibling: that spot is `pos + next.nodeSize` once it is gone.
  const target = pos + next.nodeSize;
  tr.delete(pos, pos + node.nodeSize);
  tr.insert(target, node);
  return target;
};

// The start position of the block the selection sits in, chosen the way the
// hover handle chooses its target: a list item or a callout's own block rather
// than the paragraph inside it, the top-level block otherwise.
export const selectedBlockPos = (tr: Transaction): number | null => {
  const { selection } = tr;
  if (selection instanceof NodeSelection) {
    return selection.from;
  }
  const $from = selection.$from;
  if ($from.depth === 0) {
    return null;
  }
  const path: PathStep[] = [];
  for (let d = 0; d <= $from.depth; d++) {
    path.push({
      type: $from.node(d).type.name,
      index: d > 0 ? $from.index(d - 1) : 0,
    });
  }
  const inner = innerHandleTarget(path);
  return $from.before(inner ? inner.depth : 1);
};

// Puts the selection back on the moved block: the node itself when it holds
// no text to put a cursor in (an image, a divider), its first text position
// otherwise.
const selectMoved = (tr: Transaction, pos: number): void => {
  const node = tr.doc.nodeAt(pos);
  if (!node) {
    return;
  }
  if (node.isAtom || (node.isLeaf && !node.isTextblock)) {
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    return;
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
};

export const BlockMoveExtension = Extension.create({
  name: 'blockMove',

  addCommands() {
    return {
      moveBlockAt:
        (pos, direction) =>
        ({ tr, dispatch }) => {
          const target = moveBlock(tr, pos, direction);
          if (target === null) {
            return false;
          }
          if (dispatch) {
            selectMoved(tr, target);
            tr.scrollIntoView();
          }
          return true;
        },
      moveSelectedBlock:
        (direction) =>
        ({ tr, dispatch }) => {
          const pos = selectedBlockPos(tr);
          if (pos === null) {
            return false;
          }
          const target = moveBlock(tr, pos, direction);
          if (target === null) {
            return false;
          }
          if (dispatch) {
            selectMoved(tr, target);
            tr.scrollIntoView();
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Alt-ArrowUp': () => this.editor.commands.moveSelectedBlock('up'),
      'Alt-ArrowDown': () => this.editor.commands.moveSelectedBlock('down'),
    };
  },
});
