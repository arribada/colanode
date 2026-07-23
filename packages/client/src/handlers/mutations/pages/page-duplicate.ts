import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageDuplicateMutationInput,
  PageDuplicateMutationOutput,
} from '@colanode/client/mutations/pages/page-duplicate';
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

export class PageDuplicateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PageDuplicateMutationInput>
{
  async handleMutation(
    input: PageDuplicateMutationInput
  ): Promise<PageDuplicateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const sourceRow = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', input.pageId)
      .executeTakeFirst();

    if (!sourceRow || sourceRow.type !== 'page') {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The page to duplicate could not be found.'
      );
    }

    const sourceAttributes = JSON.parse(sourceRow.attributes) as PageAttributes;

    const childPageRows = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('parent_id', '=', input.pageId)
      .where('type', '=', 'page')
      .execute();

    // Old node id -> duplicated node id (the page itself + its direct
    // children pages, duplicated one level deep).
    const nodeIdMap = new Map<string, string>();
    const newPageId = generateId(IdType.Page);
    nodeIdMap.set(input.pageId, newPageId);
    for (const childRow of childPageRows) {
      nodeIdMap.set(childRow.id, generateId(IdType.Page));
    }

    await workspace.nodes.insertNode(newPageId, {
      ...sourceAttributes,
      name: `${sourceAttributes.name} (copie)`,
    });

    await this.duplicateDocument(workspace, input.pageId, newPageId, nodeIdMap);

    for (const childRow of childPageRows) {
      const newChildId = nodeIdMap.get(childRow.id);
      if (!newChildId) {
        continue;
      }

      const childAttributes = JSON.parse(childRow.attributes) as PageAttributes;
      await workspace.nodes.insertNode(newChildId, {
        ...childAttributes,
        parentId: newPageId,
      });

      await this.duplicateDocument(
        workspace,
        childRow.id,
        newChildId,
        nodeIdMap
      );
    }

    return {
      id: newPageId,
    };
  }

  private async duplicateDocument(
    workspace: WorkspaceService,
    sourceId: string,
    targetId: string,
    nodeIdMap: Map<string, string>
  ): Promise<void> {
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

    // Old block id -> duplicated block id. Reference blocks keep pointing
    // at the same node unless that node was duplicated alongside the page.
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

    await workspace.documents.updateDocument(targetId, update);
  }

  private mapBlockId(block: Block, nodeIdMap: Map<string, string>): string {
    if (nodeReferenceBlockTypes.has(block.type)) {
      return nodeIdMap.get(block.id) ?? block.id;
    }

    return generateId(IdType.Block);
  }
}
