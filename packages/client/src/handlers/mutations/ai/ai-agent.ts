import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiAgentMutationInput,
  AiAgentMutationOutput,
} from '@colanode/client/mutations/ai/ai-agent';
import { AiAgentInput, AiAgentOutput } from '@colanode/core';

export class AiAgentMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiAgentMutationInput>
{
  async handleMutation(
    input: AiAgentMutationInput
  ): Promise<AiAgentMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      const body: AiAgentInput = {
        message: input.message,
        selection: input.selection,
        pageId: input.pageId,
        context: input.context,
      };

      const output = await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/ai/agent`, {
          json: body,
        })
        .json<AiAgentOutput>();

      return output;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
