import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicatePageSubtree } from '@colanode/client/lib/node-subtree-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  PageDuplicateMutationInput,
  PageDuplicateMutationOutput,
} from '@colanode/client/mutations/pages/page-duplicate';
import { IdType, PageAttributes, generateId } from '@colanode/core';

// "Duplicate page" (sidebar): deep-copies the page and its FULL descendant
// page subtree (recursively), names the new root "<name> (copy)" and files it
// under the original page's parent. Document blocks are remapped by the shared
// duplicatePageSubtree helper. The source subtree is left untouched.
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

    const newPageId = generateId(IdType.Page);

    await duplicatePageSubtree({
      workspace,
      sourcePageId: input.pageId,
      newRootId: newPageId,
      // File the copy alongside the original, under the same parent.
      rootParentId: sourceAttributes.parentId,
      transformRootAttributes: (attributes) => ({
        ...attributes,
        name: `${attributes.name} (copy)`,
      }),
    });

    return {
      id: newPageId,
    };
  }
}
