import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicatePageSubtree } from '@colanode/client/lib/node-subtree-copy';
import {
  generateAppendIndex,
  getTemplateParentError,
} from '@colanode/client/lib/page-template-parent';
import { MutationHandler } from '@colanode/client/lib/types';
import { fetchNodeTree } from '@colanode/client/lib/utils';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageTemplateCreateMutationInput,
  PageTemplateCreateMutationOutput,
} from '@colanode/client/mutations/pages/page-template-create';
import { IdType, PageAttributes, generateId } from '@colanode/core';

// "New from template": deep-copies a space's page template and its FULL
// descendant page subtree (recursively) into a brand-new normal page filed
// under `parentId` — the space root by default, or a page/folder of that space
// — after the parent's existing children. The new root drops isTemplate/
// deletedAt/deletedBy so it is an ordinary page (copied descendants are plain
// pages too). The template itself is left untouched so it can be reused again.
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

    if (sourceRow.root_id !== input.spaceId) {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The page template could not be found in this space.'
      );
    }

    const parentId = input.parentId ?? input.spaceId;
    const parentTree = await fetchNodeTree(workspace.database, parentId);
    const parentError = getTemplateParentError(
      parentTree,
      parentId,
      input.spaceId,
      workspace.userId
    );

    if (parentError) {
      throw new MutationError(
        parentTree.length === 0
          ? MutationErrorCode.NodeNotFound
          : MutationErrorCode.Unknown,
        parentError
      );
    }

    // Every child of the parent counts (see generateAppendIndex): the copy must
    // not land in the middle of a sibling list the user has already ordered.
    const siblingRows = await workspace.database
      .selectFrom('nodes')
      .select(['id', 'attributes'])
      .where('parent_id', '=', parentId)
      .execute();

    const index = generateAppendIndex(
      siblingRows.map((row) => ({
        id: row.id,
        index:
          (JSON.parse(row.attributes) as { index?: string | null }).index ??
          null,
      }))
    );

    const newPageId = generateId(IdType.Page);

    await duplicatePageSubtree({
      workspace,
      sourcePageId: input.templateId,
      newRootId: newPageId,
      rootParentId: parentId,
      transformRootAttributes: (attributes) => {
        const {
          isTemplate: _isTemplate,
          deletedAt: _deletedAt,
          deletedBy: _deletedBy,
          // The template's own index ordered it among the space's children;
          // the copy is placed at the end of its new parent instead.
          index: _index,
          ...rest
        } = attributes;
        return index ? { ...rest, index } : rest;
      },
    });

    return {
      id: newPageId,
    };
  }
}
