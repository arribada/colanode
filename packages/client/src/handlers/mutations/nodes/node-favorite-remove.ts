import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeFavoriteRemoveMutationInput,
  NodeFavoriteRemoveMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeFavoriteRemoveMutationHandler
  implements MutationHandler<NodeFavoriteRemoveMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeFavoriteRemoveMutationInput
  ): Promise<NodeFavoriteRemoveMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      await workspaceService.account.client.delete(
        `v1/workspaces/${workspaceService.workspace.workspaceId}/favorites/${input.nodeId}`
      );
      return { success: true };
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
