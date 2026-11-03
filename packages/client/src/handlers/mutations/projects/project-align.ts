import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { ProjectAlignMutationInput } from '@colanode/client/mutations/projects/project-align';
import { ProjectAlignOutput } from '@colanode/core';

export class ProjectAlignMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<ProjectAlignMutationInput>
{
  public async handleMutation(
    input: ProjectAlignMutationInput
  ): Promise<ProjectAlignOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/projects/align`, {
          json: {
            pageId: input.pageId,
            code: input.code,
            apply: input.apply,
            plane: input.plane,
            aliases: input.aliases,
          },
          timeout: 60_000,
        })
        .json<ProjectAlignOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
