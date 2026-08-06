import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeShareSuggestionResolveMutationInput,
  NodeShareSuggestionResolveMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeShareSuggestionResolveMutationHandler
  implements MutationHandler<NodeShareSuggestionResolveMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeShareSuggestionResolveMutationInput
  ): Promise<NodeShareSuggestionResolveMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      await workspaceService.account.client.patch(
        `v1/workspaces/${workspaceService.workspace.workspaceId}/shares/suggestions/${input.suggestionId}`,
        { json: { status: input.status } }
      );
      return { success: true };
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
