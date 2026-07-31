import { MutationHandler } from '@colanode/client/lib/types';
import {
  PresenceUpdateMutationInput,
  PresenceUpdateMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';
import { PresenceState } from '@colanode/core';

export class PresenceUpdateMutationHandler
  implements MutationHandler<PresenceUpdateMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: PresenceUpdateMutationInput
  ): Promise<PresenceUpdateMutationOutput> {
    // Presence is intentionally allowed for readonly viewers, so this does not
    // go through the readonly-guarded workspace mutation base.
    const workspace = this.app.getWorkspace(input.userId);
    if (!workspace) {
      return { success: false };
    }

    const presence: PresenceState = {
      userId: input.userId,
      deviceId: workspace.account.deviceId,
      workspaceId: input.workspaceId,
      rootId: input.rootId,
      nodeId: input.nodeId,
      kind: input.kind,
      name: input.name,
      color: input.color,
      avatar: input.avatar ?? null,
      payload: input.payload,
      ts: Date.now(),
    };

    workspace.account.presence.publish(presence);

    return { success: true };
  }
}
