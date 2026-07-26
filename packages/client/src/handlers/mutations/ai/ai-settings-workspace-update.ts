import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiSettingsWorkspaceUpdateMutationInput,
  AiSettingsWorkspaceUpdateMutationOutput,
} from '@colanode/client/mutations/ai/ai-settings-workspace-update';
import {
  AiWorkspaceSettingsOutput,
  AiWorkspaceSettingsUpdateInput,
} from '@colanode/core';

export class AiSettingsWorkspaceUpdateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiSettingsWorkspaceUpdateMutationInput>
{
  async handleMutation(
    input: AiSettingsWorkspaceUpdateMutationInput
  ): Promise<AiSettingsWorkspaceUpdateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      const body: AiWorkspaceSettingsUpdateInput = {
        enabled: input.enabled,
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
      };

      const output = await workspace.account.client
        .put(`v1/workspaces/${workspace.workspaceId}/ai/settings/workspace`, {
          json: body,
        })
        .json<AiWorkspaceSettingsOutput>();

      return output;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
