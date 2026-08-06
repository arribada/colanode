import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeFavoriteAddMutationInput,
  NodeFavoriteAddMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeFavoriteAddMutationHandler
  implements MutationHandler<NodeFavoriteAddMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeFavoriteAddMutationInput
  ): Promise<NodeFavoriteAddMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      return await workspaceService.account.client
        .post(
          `v1/workspaces/${workspaceService.workspace.workspaceId}/favorites`,
          {
            json: {
              nodeId: input.nodeId,
            },
          }
        )
        .json<NodeFavoriteAddMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
