import { BlockChildren, indexBlockChildren } from '@colanode/core/lib/block-tree';
import { Block } from '@colanode/core/registry/block';
import { DocumentContent } from '@colanode/core/registry/documents';

export const extractDocumentText = (id: string, content: DocumentContent) => {
  return extractBlockTexts(id, content.blocks);
};

export const extractBlockTexts = (
  nodeId: string,
  blocks: Record<string, Block> | undefined | null
): string | null => {
  if (!blocks) {
    return null;
  }

  // The children are grouped once. Scanning every block for the children of
  // each block made this quadratic: a 4,000-block page took ten seconds, on
  // the worker that also answers every query, so a first sync of the large
  // Platform pages froze search for minutes.
  const result = collectBlockText(
    nodeId,
    blocks,
    indexBlockChildren(blocks),
    new Set()
  );
  return result.length > 0 ? result : null;
};

const collectBlockText = (
  blockId: string,
  blocks: Record<string, Block>,
  children: BlockChildren,
  visited: Set<string>
): string => {
  // A parent cycle in corrupted content must end the walk, not the stack.
  if (visited.has(blockId)) {
    return '';
  }
  visited.add(blockId);

  const texts: string[] = [];

  // Extract text from the current block's leaf nodes
  const block = blocks[blockId];
  if (block) {
    let text = '';
    if (block.content) {
      for (const leaf of block.content) {
        if (leaf.text) {
          text += leaf.text;
        }
      }
    }
    texts.push(text);
  }

  for (const child of children.get(blockId) ?? []) {
    texts.push(collectBlockText(child.id, blocks, children, visited));
  }

  return texts.join('\n');
};
