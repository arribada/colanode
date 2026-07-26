import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiCompleteMutationInput,
  AiCompleteMutationOutput,
} from '@colanode/client/mutations/ai/ai-complete';
import { AiCompleteInput, AiCompleteOutput } from '@colanode/core';

export class AiCompleteMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiCompleteMutationInput>
{
  async handleMutation(
    input: AiCompleteMutationInput
  ): Promise<AiCompleteMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      const body: AiCompleteInput = {
        action: input.action,
        prompt: input.prompt ?? '',
        selection: input.selection,
        context: input.context,
      };

      const output = await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/ai/complete`, {
          json: body,
        })
        .json<AiCompleteOutput>();

      return output;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
