import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiChatMutationInput,
  AiChatMutationOutput,
} from '@colanode/client/mutations/ai/ai-chat';
import { AiChatInput, AiChatOutput } from '@colanode/core';

export class AiChatMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiChatMutationInput>
{
  async handleMutation(
    input: AiChatMutationInput
  ): Promise<AiChatMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      const body: AiChatInput = {
        messages: input.messages,
        pageId: input.pageId,
        selection: input.selection,
        context: input.context,
      };

      const output = await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/ai/chat`, {
          json: body,
        })
        .json<AiChatOutput>();

      return output;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
