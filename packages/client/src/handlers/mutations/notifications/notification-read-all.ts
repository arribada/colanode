import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { eventBus } from '@colanode/client/lib/event-bus';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  NotificationReadAllMutationInput,
  NotificationReadAllMutationOutput,
} from '@colanode/client/mutations/notifications/notification-read-all';
import { generateId, IdType, NotificationReadMutation } from '@colanode/core';

export class NotificationReadAllMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<NotificationReadAllMutationInput>
{
  async handleMutation(
    input: NotificationReadAllMutationInput
  ): Promise<NotificationReadAllMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const now = new Date().toISOString();

    const readNotificationIds = await workspace.database
      .transaction()
      .execute(async (trx) => {
        const unread = await trx
          .selectFrom('notifications')
          .select('id')
          .where('read_at', 'is', null)
          .execute();

        const notificationIds = unread.map((notification) => notification.id);
        if (notificationIds.length === 0) {
          return notificationIds;
        }

        await trx
          .updateTable('notifications')
          .set({ read_at: now })
          .where('read_at', 'is', null)
          .execute();

        const mutationRows = notificationIds.map((notificationId) => {
          const mutation: NotificationReadMutation = {
            id: generateId(IdType.Mutation),
            createdAt: now,
            type: 'notification.read',
            data: { notificationId, readAt: now },
          };

          return {
            id: mutation.id,
            type: mutation.type,
            data: JSON.stringify(mutation.data),
            created_at: mutation.createdAt,
            retries: 0,
          };
        });

        await trx.insertInto('mutations').values(mutationRows).execute();

        return notificationIds;
      });

    if (readNotificationIds.length === 0) {
      return { success: true };
    }

    workspace.mutations.scheduleSync();

    // The notification list and unread-count queries both recompute from the
    // database on any notification.read event for this user, so publishing a
    // single event collapses the refresh into one re-query instead of one per
    // notification that was marked read.
    const [firstNotificationId] = readNotificationIds;
    if (firstNotificationId) {
      eventBus.publish({
        type: 'notification.read',
        workspace: {
          workspaceId: workspace.workspaceId,
          userId: workspace.userId,
          accountId: workspace.accountId,
        },
        notificationId: firstNotificationId,
      });
    }

    return { success: true };
  }
}
