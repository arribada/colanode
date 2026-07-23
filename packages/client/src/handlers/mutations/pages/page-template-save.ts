import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicateNodeDocument } from '@colanode/client/lib/node-document-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageTemplateSaveMutationInput,
  PageTemplateSaveMutationOutput,
} from '@colanode/client/mutations/pages/page-template-save';
import { IdType, PageAttributes, generateId } from '@colanode/core';

// "Save page as template": deep-copies the page (+ its document, + one level
// of children pages and their documents — same depth as page.duplicate) into
// a new page marked isTemplate, filed directly under the page's space so it
// surfaces via that space's "New from template" menu. The source page and
// its children are left untouched.
export class PageTemplateSaveMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PageTemplateSaveMutationInput>
{
  async handleMutation(
    input: PageTemplateSaveMutationInput
  ): Promise<PageTemplateSaveMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const sourceRow = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', input.pageId)
      .executeTakeFirst();

    if (!sourceRow || sourceRow.type !== 'page') {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The page to save as a template could not be found.'
      );
    }

    const sourceAttributes = JSON.parse(sourceRow.attributes) as PageAttributes;

    if (sourceAttributes.isTemplate) {
      throw new MutationError(
        MutationErrorCode.Unknown,
        'This page is already a template.'
      );
    }

    // Every node's rootId is the space it lives in (space nodes are their
    // own root), so this reparents the template to the space regardless of
    // how deeply the source page itself was nested.
    const spaceId = sourceRow.root_id;

    const childPageRows = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('parent_id', '=', input.pageId)
      .where('type', '=', 'page')
      .execute();

    const nodeIdMap = new Map<string, string>();
    const newTemplateId = generateId(IdType.Page);
    nodeIdMap.set(input.pageId, newTemplateId);
    for (const childRow of childPageRows) {
      nodeIdMap.set(childRow.id, generateId(IdType.Page));
    }

    await workspace.nodes.insertNode(newTemplateId, {
      ...sourceAttributes,
      parentId: spaceId,
      isTemplate: true,
    });

    await duplicateNodeDocument(
      workspace,
      input.pageId,
      newTemplateId,
      nodeIdMap
    );

    for (const childRow of childPageRows) {
      const newChildId = nodeIdMap.get(childRow.id);
      if (!newChildId) {
        continue;
      }

      const childAttributes = JSON.parse(
        childRow.attributes
      ) as PageAttributes;

      await workspace.nodes.insertNode(newChildId, {
        ...childAttributes,
        parentId: newTemplateId,
      });

      await duplicateNodeDocument(workspace, childRow.id, newChildId, nodeIdMap);
    }

    return {
      id: newTemplateId,
    };
  }
}
