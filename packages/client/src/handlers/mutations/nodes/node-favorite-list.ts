import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeFavoriteListMutationInput,
  NodeFavoriteListMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeFavoriteListMutationHandler
  implements MutationHandler<NodeFavoriteListMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeFavoriteListMutationInput
  ): Promise<NodeFavoriteListMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      return await workspaceService.account.client
        .get(`v1/workspaces/${workspaceService.workspace.workspaceId}/favorites`)
        .json<NodeFavoriteListMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
