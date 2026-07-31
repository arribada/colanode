import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MuteSetMutationInput,
  MuteSetMutationOutput,
} from '@colanode/client/mutations/notifications/mute-set';

export class MuteSetMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<MuteSetMutationInput>
{
  async handleMutation(
    input: MuteSetMutationInput
  ): Promise<MuteSetMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    await workspace.notificationMutes.setMute(input.nodeId, input.muted);
    return { success: true };
  }
}
