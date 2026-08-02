import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicatePageSubtree } from '@colanode/client/lib/node-subtree-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageTemplateCreateMutationInput,
  PageTemplateCreateMutationOutput,
} from '@colanode/client/mutations/pages/page-template-create';
import { IdType, PageAttributes, generateId } from '@colanode/core';

// "New from template": deep-copies a space's page template and its FULL
// descendant page subtree (recursively) into a brand-new normal page under the
// given space. The new root drops isTemplate/deletedAt/deletedBy so it is an
// ordinary page (copied descendants are plain pages too). The template itself
// is left untouched so it can be reused again.
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

    const newPageId = generateId(IdType.Page);

    await duplicatePageSubtree({
      workspace,
      sourcePageId: input.templateId,
      newRootId: newPageId,
      rootParentId: input.spaceId,
      transformRootAttributes: (attributes) => {
        const {
          isTemplate: _isTemplate,
          deletedAt: _deletedAt,
          deletedBy: _deletedBy,
          ...rest
        } = attributes;
        return rest;
      },
    });

    return {
      id: newPageId,
    };
  }
}
