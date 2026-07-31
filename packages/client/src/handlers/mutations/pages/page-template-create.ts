import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicateNodeDocument } from '@colanode/client/lib/node-document-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageTemplateCreateMutationInput,
  PageTemplateCreateMutationOutput,
} from '@colanode/client/mutations/pages/page-template-create';
import { IdType, PageAttributes, generateId } from '@colanode/core';

// "New from template": deep-copies a space's page template (+ its document,
// + one level of children pages and their documents, symmetric with
// page.template.save) into a brand-new normal page under the given space.
// The template itself is left untouched so it can be reused again.
export class PageTemplateCreateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PageTemplateCreateMutationInput>
{
  async handleMutation(
    input: PageTemplateCreateMutationInput
  ): Promise<PageTemplateCreateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const sourceRow = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', input.templateId)
      .executeTakeFirst();

    if (!sourceRow || sourceRow.type !== 'page') {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The page template could not be found.'
      );
    }

    const sourceAttributes = JSON.parse(sourceRow.attributes) as PageAttributes;

    if (!sourceAttributes.isTemplate) {
      throw new MutationError(
        MutationErrorCode.Unknown,
        'This page is not a template.'
      );
    }

    const childPageRows = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('parent_id', '=', input.templateId)
      .where('type', '=', 'page')
      .execute();

    const nodeIdMap = new Map<string, string>();
    const newPageId = generateId(IdType.Page);
    nodeIdMap.set(input.templateId, newPageId);
    for (const childRow of childPageRows) {
      nodeIdMap.set(childRow.id, generateId(IdType.Page));
    }

    const {
      isTemplate: _isTemplate,
      deletedAt: _deletedAt,
      deletedBy: _deletedBy,
      ...rest
    } = sourceAttributes;

    await workspace.nodes.insertNode(newPageId, {
      ...rest,
      parentId: input.spaceId,
    });

    await duplicateNodeDocument(
      workspace,
      input.templateId,
      newPageId,
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
        parentId: newPageId,
      });

      await duplicateNodeDocument(workspace, childRow.id, newChildId, nodeIdMap);
    }

    return {
      id: newPageId,
    };
  }
}
