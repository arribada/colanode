import { SelectNode } from '@colanode/client/databases';
import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import {
  buildDescendantAttributes,
  idTypeForNodeType,
} from '@colanode/client/lib/node-subtree-copy';
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
  NodeAttributes,
  NodeType,
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

// The descendant node types copied alongside the page, mirroring the in-
// workspace subtree copy in node-subtree-copy.ts: pages, databases (together
// with their database_view + record children), whiteboards and folders. Files
// are deliberately excluded here -- a file's blob lives in the SOURCE
// workspace's local storage and cannot be re-uploaded into the destination from
// this handler, so copying one would create a broken, contentless node. A file
// (and any embed/reference pointing at it) is therefore left pointing at the
// original, exactly like the in-workspace best-effort copy. Messaging nodes
// (channel/chat/message) never live under a page.
const copyableDescendantTypes: NodeType[] = [
  'page',
  'database',
  'database_view',
  'record',
  'whiteboard',
  'folder',
];

// Copy a page (and its descendant subtree) from one workspace into another.
// This is a COPY, never a re-parent: cross-workspace moves would keep the old
// root_id and quietly corrupt access, so we always insert fresh nodes under the
// destination parent -- insertNode derives the destination root_id from that
// parent -- and only trash the original when asked to.
//
// Every copyable descendant (pages, databases with their views + records,
// whiteboards, folders) is copied, and the FULL old->new node id map is built
// up front so that every embed block AND every relation field value remaps to
// the copied node it points at, in either direction. A reference to a node that
// was NOT copied (a file, or anything outside the subtree) falls back to the
// original id rather than pointing at nothing.
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

    // Collect the page and every copyable descendant in the source workspace,
    // walking parent_id breadth-first so a parent is always ordered before its
    // children (the destination parent has to exist before insertNode can
    // resolve its root_id). A visited set guards against a corrupted parent_id
    // chain spinning this loop forever.
    const ordered: SelectNode[] = [sourceRow];
    const visited = new Set<string>([sourceRow.id]);
    let frontier: string[] = [sourceRow.id];
    while (frontier.length > 0) {
      const childRows = await source.database
        .selectFrom('nodes')
        .selectAll()
        .where('parent_id', 'in', frontier)
        .where('type', 'in', copyableDescendantTypes)
        .execute();

      const nextFrontier: string[] = [];
      for (const childRow of childRows) {
        if (visited.has(childRow.id)) {
          continue;
        }
        visited.add(childRow.id);
        ordered.push(childRow);
        nextFrontier.push(childRow.id);
      }
      frontier = nextFrontier;
    }

    // Build the FULL old->new node id map BEFORE inserting anything, so a
    // reference in any node remaps to its copied target regardless of the order
    // nodes are processed in (a reference can point either up or down the tree).
    const nodeIdMap = new Map<string, string>();
    nodeIdMap.set(sourceRow.id, generateId(IdType.Page));
    for (const row of ordered) {
      if (nodeIdMap.has(row.id)) {
        continue;
      }
      nodeIdMap.set(row.id, generateId(idTypeForNodeType(row.type as NodeType)));
    }

    // Insert parent-before-child into the DESTINATION workspace; insertNode
    // derives the new root_id from the already-inserted destination parent.
    for (const row of ordered) {
      const newId = nodeIdMap.get(row.id)!;
      const attributes = JSON.parse(row.attributes) as NodeAttributes;

      if (row.id === input.pageId) {
        // The root is always a page: file it under the caller-chosen target
        // parent, keeping the rest of its attributes.
        if (attributes.type !== 'page') {
          continue;
        }
        await target.nodes.insertNode(newId, {
          ...attributes,
          parentId: input.targetParentId,
        });
      } else {
        // Descendants copy their own attributes with only their references
        // remapped -- a record's databaseId + relation field values, a
        // relation field's databaseId -- through the shared node id map, the
        // same way the in-workspace subtree copy does.
        const newParentId =
          nodeIdMap.get(row.parent_id ?? '') ?? input.targetParentId;
        await target.nodes.insertNode(
          newId,
          buildDescendantAttributes(attributes, newParentId, nodeIdMap)
        );
      }

      await this.copyDocument(source, target, row.id, newId, nodeIdMap);
    }

    if (input.trashOriginal) {
      await source.nodes.updateNode<PageAttributes>(input.pageId, (attrs) => {
        attrs.deletedAt = new Date().toISOString();
        attrs.deletedBy = input.userId;
        return attrs;
      });
    }

    return { id: nodeIdMap.get(input.pageId)! };
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

    // Old block id -> new block id. A reference block follows the node id map
    // when the node it embeds was copied alongside the page; when it was not
    // (a file, or a node outside the subtree) it keeps pointing at the original.
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
