import { MutationHandler } from '@colanode/client/lib/types';
import {
  PresenceLeaveMutationInput,
  PresenceLeaveMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class PresenceLeaveMutationHandler
  implements MutationHandler<PresenceLeaveMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: PresenceLeaveMutationInput
  ): Promise<PresenceLeaveMutationOutput> {
    const workspace = this.app.getWorkspace(input.userId);
    if (!workspace) {
      return { success: false };
    }

    workspace.account.presence.leave({
      userId: input.userId,
      deviceId: workspace.account.deviceId,
      workspaceId: input.workspaceId,
      rootId: input.rootId,
      nodeId: input.nodeId,
      kind: input.kind,
    });

    return { success: true };
  }
}
