import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeShareSuggestionsListMutationInput,
  NodeShareSuggestionsListMutationOutput,
  ShareSuggestionItem,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeShareSuggestionsListMutationHandler
  implements MutationHandler<NodeShareSuggestionsListMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeShareSuggestionsListMutationInput
  ): Promise<NodeShareSuggestionsListMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      const suggestions = await workspaceService.account.client
        .get(
          `v1/workspaces/${workspaceService.workspace.workspaceId}/shares/suggestions`,
          { searchParams: { nodeId: input.nodeId } }
        )
        .json<ShareSuggestionItem[]>();
      return { suggestions };
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
