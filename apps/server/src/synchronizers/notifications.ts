import { SyncNotificationData, SyncNotificationsInput, SynchronizerOutputMessage } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNotification } from '@colanode/server/data/schema';
import { createLogger } from '@colanode/server/lib/logger';
import { BaseSynchronizer } from '@colanode/server/synchronizers/base';
import { Event } from '@colanode/server/types/events';

const logger = createLogger('notifications-synchronizer');

export class NotificationSynchronizer extends BaseSynchronizer<SyncNotificationsInput> {
  public async fetchData(): Promise<SynchronizerOutputMessage<SyncNotificationsInput> | null> {
    const rows = await this.fetchNotifications();
    if (rows.length === 0) {
      return null;
    }

    return this.buildMessage(rows);
  }

  public async fetchDataFromEvent(
    event: Event
  ): Promise<SynchronizerOutputMessage<SyncNotificationsInput> | null> {
    if (!this.shouldFetch(event)) {
      return null;
    }

    const rows = await this.fetchNotifications();
    if (rows.length === 0) {
      return null;
    }

    return this.buildMessage(rows);
  }

  private async fetchNotifications(): Promise<SelectNotification[]> {
    if (this.status === 'fetching') {
      return [];
    }

    this.status = 'fetching';

    try {
      return await database
        .selectFrom('notifications')
        .selectAll()
        .where('user_id', '=', this.user.userId)
        .where('revision', '>', this.cursor)
        .orderBy('revision', 'asc')
        .limit(100)
        .execute();
    } catch (error) {
      logger.error(error, 'Error fetching notifications for sync');
    } finally {
      this.status = 'pending';
    }

    return [];
  }

  private buildMessage(
    rows: SelectNotification[]
  ): SynchronizerOutputMessage<SyncNotificationsInput> {
    const items: SyncNotificationData[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      rootId: row.root_id,
      notificationType: row.type as SyncNotificationData['notificationType'],
      sourceNodeId: row.source_node_id,
      actorId: row.actor_id,
      preview: row.preview,
      createdAt: row.created_at.toISOString(),
      readAt: row.read_at ? row.read_at.toISOString() : null,
      revision: row.revision.toString(),
    }));

    return {
      type: 'synchronizer.output',
      userId: this.user.userId,
      id: this.id,
      items: items.map((item) => ({
        cursor: item.revision,
        data: item,
      })),
    };
  }

  private shouldFetch(event: Event): boolean {
    return (
      (event.type === 'notification.created' ||
        event.type === 'notification.updated') &&
      event.userId === this.user.userId
    );
  }
}
