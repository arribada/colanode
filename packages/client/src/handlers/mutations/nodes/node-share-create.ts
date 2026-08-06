import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeShareCreateMutationInput,
  NodeShareCreateMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class NodeShareCreateMutationHandler
  implements MutationHandler<NodeShareCreateMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeShareCreateMutationInput
  ): Promise<NodeShareCreateMutationOutput> {
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
          `v1/workspaces/${workspaceService.workspace.workspaceId}/shares`,
          {
            json: {
              nodeId: input.nodeId,
              includeSubpages: input.includeSubpages,
              password: input.password,
              expiresInDays: input.expiresInDays,
            },
          }
        )
        .json<NodeShareCreateMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
