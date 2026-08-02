import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import {
  Block,
  EditorNodeTypes,
  IdType,
  RichTextContent,
  generateId,
  richTextContentSchema,
} from '@colanode/core';
import { YDoc } from '@colanode/crdt';

// Shared deep-copy helper for a node's rich text document, used by every
// "duplicate this node" style mutation (page.duplicate, record.template.save,
// record.template.create, page.template.save, page.template.create). Mirrors
// the block-remapping approach first established by the page duplicate
// mutation: blocks that embed another node reuse that node's id as their
// block id, so those references must be remapped consistently with the
// node id map, while every other block gets a fresh id.
export const nodeReferenceBlockTypes = new Set<string>([
  EditorNodeTypes.Page,
  EditorNodeTypes.File,
  EditorNodeTypes.Folder,
  'database',
  'whiteboardEmbed',
]);

export const mapCopiedBlockId = (
  block: Block,
  nodeIdMap: Map<string, string>
): string => {
  if (nodeReferenceBlockTypes.has(block.type)) {
    return nodeIdMap.get(block.id) ?? block.id;
  }

  return generateId(IdType.Block);
};

// Inline mentions (leaf.type === 'mention') carry the mentioned node id in
// leaf.attrs.target; remap it to the copied node when that node was duplicated
// alongside this document, so a mention of a copied sub-node points at the copy
// (a mention of a node outside the subtree falls back to the original id).
export const remapBlockMentions = (
  block: Block,
  nodeIdMap: Map<string, string>
): void => {
  if (!block.content) {
    return;
  }

  for (const leaf of block.content) {
    if (leaf.type !== 'mention' || !leaf.attrs) {
      continue;
    }

    const target = leaf.attrs['target'];
    if (typeof target === 'string') {
      leaf.attrs['target'] = nodeIdMap.get(target) ?? target;
    }
  }
};

// Copies the document belonging to sourceId onto targetId. nodeIdMap maps
// old node ids to their newly duplicated counterparts (targetId must already
// be registered under sourceId) so that reference blocks keep pointing at the
// right duplicated node when that node was duplicated alongside this one.
export const duplicateNodeDocument = async (
  workspace: WorkspaceService,
  sourceId: string,
  targetId: string,
  nodeIdMap: Map<string, string>
): Promise<void> => {
  const documentRow = await workspace.database
    .selectFrom('documents')
    .selectAll()
    .where('id', '=', sourceId)
    .executeTakeFirst();

  if (!documentRow) {
    return;
  }

  const content = JSON.parse(documentRow.content) as RichTextContent;
  const blocks = Object.values(content.blocks ?? {});
  if (blocks.length === 0) {
    return;
  }

  const blockIdMap = new Map<string, string>();
  blockIdMap.set(sourceId, targetId);
  for (const block of blocks) {
    blockIdMap.set(block.id, mapCopiedBlockId(block, nodeIdMap));
  }

  const newBlocks: Record<string, Block> = {};
  for (const block of blocks) {
    const newId = blockIdMap.get(block.id);
    if (!newId) {
      continue;
    }

    const copied = JSON.parse(JSON.stringify(block)) as Block;
    copied.id = newId;
    copied.parentId = blockIdMap.get(block.parentId) ?? targetId;
    remapBlockMentions(copied, nodeIdMap);
    newBlocks[newId] = copied;
  }

  const ydoc = new YDoc();
  const update = ydoc.update(richTextContentSchema, {
    type: 'rich_text',
    blocks: newBlocks,
  });

  if (!update) {
    return;
  }

  await workspace.documents.updateDocument(targetId, update);
};
