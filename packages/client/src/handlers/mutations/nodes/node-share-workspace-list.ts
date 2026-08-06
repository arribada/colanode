import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeShareWorkspaceListMutationInput,
  NodeShareWorkspaceListMutationOutput,
  WorkspaceShareItem,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeShareWorkspaceListMutationHandler
  implements MutationHandler<NodeShareWorkspaceListMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeShareWorkspaceListMutationInput
  ): Promise<NodeShareWorkspaceListMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      const shares = await workspaceService.account.client
        .get(
          `v1/workspaces/${workspaceService.workspace.workspaceId}/shares/all`
        )
        .json<WorkspaceShareItem[]>();
      return { shares };
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
