import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { ProjectCreateMutationInput } from '@colanode/client/mutations/projects/project-create';
import { ProjectCreateOutput } from '@colanode/core';

export class ProjectCreateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<ProjectCreateMutationInput>
{
  public async handleMutation(
    input: ProjectCreateMutationInput
  ): Promise<ProjectCreateOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      // The server writes the pages; they reach this device through the
      // normal sync, like any page another person creates.
      return await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/projects`, {
          json: {
            parentId: input.parentId,
            name: input.name,
            code: input.code,
            plane: input.plane,
          },
          timeout: 60_000,
        })
        .json<ProjectCreateOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
