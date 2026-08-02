import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicatePageSubtree } from '@colanode/client/lib/node-subtree-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageTemplateSaveMutationInput,
  PageTemplateSaveMutationOutput,
} from '@colanode/client/mutations/pages/page-template-save';
import { IdType, PageAttributes, generateId } from '@colanode/core';

// "Save page as template": deep-copies the page and its FULL descendant page
// subtree (recursively) into a new page marked isTemplate, filed directly
// under the page's space so it surfaces via that space's "New from template"
// menu. Only the new ROOT is a template — copied descendants stay plain pages.
// The source subtree is left untouched.
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

    // Every node's rootId is the space it lives in (space nodes are their own
    // root), so this reparents the template to the space regardless of how
    // deeply the source page itself was nested.
    const spaceId = sourceRow.root_id;

    const newTemplateId = generateId(IdType.Page);

    await duplicatePageSubtree({
      workspace,
      sourcePageId: input.pageId,
      newRootId: newTemplateId,
      rootParentId: spaceId,
      transformRootAttributes: (attributes) => ({
        ...attributes,
        isTemplate: true,
      }),
    });

    return {
      id: newTemplateId,
    };
  }
}
