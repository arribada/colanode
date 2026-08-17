import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeShareUpdatePasswordMutationInput,
  NodeShareUpdatePasswordMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeShareUpdatePasswordMutationHandler
  implements MutationHandler<NodeShareUpdatePasswordMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeShareUpdatePasswordMutationInput
  ): Promise<NodeShareUpdatePasswordMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      return await workspaceService.account.client
        .patch(
          `v1/workspaces/${workspaceService.workspace.workspaceId}/shares/${input.shareId}/password`,
          { json: { password: input.password } }
        )
        .json<NodeShareUpdatePasswordMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
