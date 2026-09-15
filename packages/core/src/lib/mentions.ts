import { BlockChildren, indexBlockChildren } from '@colanode/core/lib/block-tree';
import { Block } from '@colanode/core/registry/block';
import { Mention } from '@colanode/core/types/mentions';

export const extractBlocksMentions = (
  nodeId: string,
  blocks: Record<string, Block> | undefined | null
): Mention[] => {
  if (!blocks) {
    return [];
  }

  // Children grouped once, as for the text: the per-block scan was quadratic
  // and ran twice per synced document update (before and after content).
  const mentions: Mention[] = [];
  collectBlockMentions(
    nodeId,
    blocks,
    indexBlockChildren(blocks),
    new Set(),
    mentions
  );
  return mentions;
};

const collectBlockMentions = (
  blockId: string,
  blocks: Record<string, Block>,
  children: BlockChildren,
  visited: Set<string>,
  mentions: Mention[]
): void => {
  if (visited.has(blockId)) {
    return;
  }
  visited.add(blockId);

  const block = blocks[blockId];
  if (block?.content) {
    for (const leaf of block.content) {
      if (leaf.type === 'mention' && leaf.attrs?.target && leaf.attrs?.id) {
        mentions.push({
          id: leaf.attrs.id,
          target: leaf.attrs.target,
        });
      }
    }
  }

  for (const child of children.get(blockId) ?? []) {
    collectBlockMentions(child.id, blocks, children, visited, mentions);
  }
};
