import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiSettingsUpdateMutationInput,
  AiSettingsUpdateMutationOutput,
} from '@colanode/client/mutations/ai/ai-settings-update';
import {
  AiUserSettingsOutput,
  AiUserSettingsUpdateInput,
} from '@colanode/core';

export class AiSettingsUpdateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiSettingsUpdateMutationInput>
{
  async handleMutation(
    input: AiSettingsUpdateMutationInput
  ): Promise<AiSettingsUpdateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      const body: AiUserSettingsUpdateInput = {
        enabled: input.enabled,
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
      };

      const output = await workspace.account.client
        .put(`v1/workspaces/${workspace.workspaceId}/ai/settings`, {
          json: body,
        })
        .json<AiUserSettingsOutput>();

      return output;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
