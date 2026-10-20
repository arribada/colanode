// ABOUTME: Which block the editor's hover handle grabs inside a list, a toggle, a
// ABOUTME: callout or a quote: the line under the pointer, not the whole container.
import { JSONContent } from '@tiptap/core';

export const LIST_ITEM_TYPES: ReadonlySet<string> = new Set([
  'listItem',
  'taskItem',
]);

// A callout's or a quote's first block is its own text: grabbing it moves the
// whole callout. The blocks after it are content of their own.
const TEXT_FIRST_CONTAINERS: ReadonlySet<string> = new Set([
  'callout',
  'blockquote',
]);

// One step of the path from the document down to the pointer: the node's type
// and its index among its parent's children.
export interface PathStep {
  type: string;
  index: number;
}

// Where the handle sits beside the grabbed block: at the list's edge (left of
// the bullet or the checkbox), at the container's edge (clear of a callout's
// icon), or at the block's own edge.
export type HandleAnchor = 'list' | 'container' | 'self';

export interface InnerHandleTarget {
  depth: number;
  anchor: HandleAnchor;
}

// The innermost block under the pointer that carries a handle of its own:
// a list item, a block in a toggle's body, or a callout's or quote's block
// after its first. `path[d]` is the node at depth d (0 = doc). Null when none
// applies, so the caller keeps the outer block's handle.
export const innerHandleTarget = (
  path: readonly PathStep[]
): InnerHandleTarget | null => {
  for (let d = path.length - 1; d > 0; d--) {
    const step = path[d];
    const parent = path[d - 1];
    if (!step || !parent) {
      continue;
    }
    if (LIST_ITEM_TYPES.has(step.type)) {
      return { depth: d, anchor: 'list' };
    }
    if (parent.type === 'toggleContent') {
      return { depth: d, anchor: 'self' };
    }
    if (TEXT_FIRST_CONTAINERS.has(parent.type) && step.index > 0) {
      return { depth: d, anchor: 'container' };
    }
  }
  return null;
};

// What "+" inserts below a hovered block. A list only holds items, so below an
// item it is an empty item of the same kind, unticked; anywhere else a
// paragraph.
export const blockBelow = (typeName: string): JSONContent => {
  if (typeName === 'taskItem') {
    return {
      type: 'taskItem',
      attrs: { checked: false },
      content: [{ type: 'paragraph' }],
    };
  }
  if (typeName === 'listItem') {
    return { type: 'listItem', content: [{ type: 'paragraph' }] };
  }
  return { type: 'paragraph' };
};
