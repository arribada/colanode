import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib';
import {
  MessageTaskSetMutationInput,
  MessageTaskSetMutationOutput,
} from '@colanode/client/mutations';
import { MessageAttributes } from '@colanode/core';

export class MessageTaskSetMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<MessageTaskSetMutationInput>
{
  async handleMutation(
    input: MessageTaskSetMutationInput
  ): Promise<MessageTaskSetMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const result = await workspace.nodes.updateNode<MessageAttributes>(
      input.messageId,
      (attributes) => {
        return {
          ...attributes,
          taskId: input.taskId,
        };
      }
    );

    return {
      success: result === 'success',
    };
  }
}
