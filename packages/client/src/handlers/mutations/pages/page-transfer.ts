import { SelectNode } from '@colanode/client/databases';
import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageTransferMutationInput,
  PageTransferMutationOutput,
} from '@colanode/client/mutations/pages/page-transfer';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import {
  Block,
  EditorNodeTypes,
  IdType,
  PageAttributes,
  RichTextContent,
  generateId,
  richTextContentSchema,
} from '@colanode/core';
import { YDoc } from '@colanode/crdt';

// Blocks that embed another node use that node's id as their block id.
const nodeReferenceBlockTypes = new Set<string>([
  EditorNodeTypes.Page,
  EditorNodeTypes.File,
  EditorNodeTypes.Folder,
  'database',
]);

// Copy a page (and its descendant pages + their documents) from one workspace
// into another. This is a COPY, never a re-parent: cross-workspace moves would
// keep the old root_id and quietly corrupt access, so we always insert fresh
// nodes under the destination parent — insertNode derives the destination
// root_id from that parent — and only trash the original when asked to.
export class PageTransferMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PageTransferMutationInput>
{
  async handleMutation(
    input: PageTransferMutationInput
  ): Promise<PageTransferMutationOutput> {
    const source = this.getWorkspace(input.userId);
    const target = this.getWorkspace(input.targetUserId);

    const sourceRow = await source.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', input.pageId)
      .executeTakeFirst();

    if (!sourceRow || sourceRow.type !== 'page') {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The page to transfer could not be found.'
      );
    }

    // Gather the page and every descendant page in the source workspace.
    const allPages = await source.database
      .selectFrom('nodes')
      .selectAll()
      .where('type', '=', 'page')
      .execute();

    const childrenByParent = new Map<string, SelectNode[]>();
    for (const row of allPages) {
      const parentId = (JSON.parse(row.attributes) as PageAttributes).parentId;
      if (!parentId) {
        continue;
      }
      const list = childrenByParent.get(parentId);
      if (list) {
        list.push(row);
      } else {
        childrenByParent.set(parentId, [row]);
      }
    }

    // Breadth-first so a parent is always inserted before its children (the
    // destination parent has to exist for insertNode to resolve its root_id).
    const ordered: SelectNode[] = [];
    const queue: SelectNode[] = [sourceRow];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (seen.has(node.id)) {
        continue;
      }
      seen.add(node.id);
      ordered.push(node);
      for (const child of childrenByParent.get(node.id) ?? []) {
        queue.push(child);
      }
    }

    const idMap = new Map<string, string>();
    for (const row of ordered) {
      idMap.set(row.id, generateId(IdType.Page));
    }

    for (const row of ordered) {
      const attributes = JSON.parse(row.attributes) as PageAttributes;
      const newId = idMap.get(row.id)!;
      const newParentId =
        row.id === input.pageId
          ? input.targetParentId
          : (idMap.get(attributes.parentId!) ?? input.targetParentId);

      await target.nodes.insertNode(newId, {
        ...attributes,
        parentId: newParentId,
      });

      await this.copyDocument(source, target, row.id, newId, idMap);
    }

    if (input.trashOriginal) {
      await source.nodes.updateNode<PageAttributes>(input.pageId, (attrs) => {
        attrs.deletedAt = new Date().toISOString();
        attrs.deletedBy = input.userId;
        return attrs;
      });
    }

    return { id: idMap.get(input.pageId)! };
  }

  private async copyDocument(
    source: WorkspaceService,
    target: WorkspaceService,
    sourceId: string,
    targetId: string,
    nodeIdMap: Map<string, string>
  ): Promise<void> {
    const documentRow = await source.database
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

    // Old block id -> new block id. Reference blocks keep pointing at the same
    // node unless that node was copied alongside the page.
    const blockIdMap = new Map<string, string>();
    blockIdMap.set(sourceId, targetId);
    for (const block of blocks) {
      blockIdMap.set(block.id, this.mapBlockId(block, nodeIdMap));
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

    await target.documents.updateDocument(targetId, update);
  }

  private mapBlockId(block: Block, nodeIdMap: Map<string, string>): string {
    if (nodeReferenceBlockTypes.has(block.type)) {
      return nodeIdMap.get(block.id) ?? block.id;
    }
    return generateId(IdType.Block);
  }
}
