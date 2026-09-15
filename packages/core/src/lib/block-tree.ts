// ABOUTME: Groups a document's blocks under their parent in one pass, so walks
// ABOUTME: over a document cost linear time instead of a scan per block.
import { Block } from '@colanode/core/registry/block';

export type BlockChildren = Map<string, Block[]>;

/**
 * Every block's children, each list in index order. Blocks with the same index
 * keep the order they have in the record, exactly as the scan-and-sort walks
 * this replaces returned them (Array.prototype.sort is stable).
 */
export const indexBlockChildren = (
  blocks: Record<string, Block>
): BlockChildren => {
  const children: BlockChildren = new Map();
  for (const block of Object.values(blocks)) {
    const siblings = children.get(block.parentId);
    if (siblings) {
      siblings.push(block);
    } else {
      children.set(block.parentId, [block]);
    }
  }

  for (const siblings of children.values()) {
    siblings.sort((a, b) => (a.index ?? '').localeCompare(b.index ?? ''));
  }

  return children;
};
