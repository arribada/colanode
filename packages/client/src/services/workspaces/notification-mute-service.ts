import { eventBus } from '@colanode/client/lib/event-bus';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import {
  generateId,
  IdType,
  MuteSetMutation,
  SyncNotificationMuteData,
} from '@colanode/core';

export class NotificationMuteService {
  private readonly workspace: WorkspaceService;

  constructor(workspaceService: WorkspaceService) {
    this.workspace = workspaceService;
  }

  public async syncServerNotificationMute(data: SyncNotificationMuteData) {
    await this.workspace.database
      .insertInto('notification_mutes')
      .values({
        id: data.id,
        user_id: data.userId,
        node_id: data.nodeId,
        workspace_id: data.workspaceId,
        muted: data.muted ? 1 : 0,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        revision: data.revision,
      })
      .onConflict((b) =>
        b.column('id').doUpdateSet({
          muted: data.muted ? 1 : 0,
          updated_at: data.updatedAt,
          revision: data.revision,
        })
      )
      .execute();

    eventBus.publish({
      type: 'notification.mute.updated',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      nodeId: data.nodeId,
    });
  }

  public async setMute(nodeId: string, muted: boolean) {
    const now = new Date().toISOString();
    await this.workspace.database.transaction().execute(async (trx) => {
      const mutation: MuteSetMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'mute.set',
        data: { nodeId, muted, updatedAt: now },
      };
      await trx
        .insertInto('mutations')
        .values({
          id: mutation.id,
          type: mutation.type,
          data: JSON.stringify(mutation.data),
          created_at: mutation.createdAt,
          retries: 0,
        })
        .execute();
    });
    this.workspace.mutations.scheduleSync();
  }
}
