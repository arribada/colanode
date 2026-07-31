
import { eventBus } from '@colanode/client/lib/event-bus';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import {
  createDebugger,
  generateId,
  IdType,
  NotificationReadMutation,
  SyncNotificationData,
} from '@colanode/core';

const debug = createDebugger('desktop:service:notification');

export class NotificationService {
  private readonly workspace: WorkspaceService;

  constructor(workspaceService: WorkspaceService) {
    this.workspace = workspaceService;
  }

  public async syncServerNotification(data: SyncNotificationData) {
    const existing = await this.workspace.database
      .selectFrom('notifications')
      .select(['id', 'revision'])
      .where('id', '=', data.id)
      .executeTakeFirst();

    if (existing) {
      if (existing.revision === data.revision) {
        debug(`Notification ${data.id} is already synced`);
        return;
      }

      await this.workspace.database
        .updateTable('notifications')
        .set({ read_at: data.readAt, revision: data.revision })
        .where('id', '=', data.id)
        .execute();

      eventBus.publish({
        type: 'notification.read',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        notificationId: data.id,
      });

      debug(`Notification ${data.id} updated`);
      return;
    }

    await this.workspace.database
      .insertInto('notifications')
      .values({
        id: data.id,
        user_id: data.userId,
        workspace_id: data.workspaceId,
        root_id: data.rootId,
        type: data.notificationType,
        source_node_id: data.sourceNodeId,
        actor_id: data.actorId,
        preview: JSON.stringify(data.preview),
        created_at: data.createdAt,
        read_at: data.readAt,
        revision: data.revision,
      })
      .onConflict((b) =>
        b.column('id').doUpdateSet({
          revision: data.revision,
          read_at: data.readAt,
        })
      )
      .execute();

    eventBus.publish({
      type: 'notification.created',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      notificationId: data.id,
    });

    debug(`Notification ${data.id} created`);
  }

  public async markAsRead(notificationId: string) {
    const now = new Date().toISOString();

    await this.workspace.database.transaction().execute(async (trx) => {
      await trx
        .updateTable('notifications')
        .set({ read_at: now })
        .where('id', '=', notificationId)
        .where('read_at', 'is', null)
        .execute();

      const mutation: NotificationReadMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'notification.read',
        data: { notificationId, readAt: now },
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

    eventBus.publish({
      type: 'notification.read',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      notificationId,
    });
  }
}
