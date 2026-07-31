import {
  SyncNotificationMuteData,
  SyncNotificationMutesInput,
  SynchronizerOutputMessage,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNotificationMute } from '@colanode/server/data/schema';
import { createLogger } from '@colanode/server/lib/logger';
import { BaseSynchronizer } from '@colanode/server/synchronizers/base';
import { Event } from '@colanode/server/types/events';

const logger = createLogger('notification-mutes-synchronizer');

export class NotificationMuteSynchronizer extends BaseSynchronizer<SyncNotificationMutesInput> {
  public async fetchData(): Promise<SynchronizerOutputMessage<SyncNotificationMutesInput> | null> {
    const rows = await this.fetchMutes();
    if (rows.length === 0) {
      return null;
    }

    return this.buildMessage(rows);
  }

  public async fetchDataFromEvent(
    event: Event
  ): Promise<SynchronizerOutputMessage<SyncNotificationMutesInput> | null> {
    if (!this.shouldFetch(event)) {
      return null;
    }

    const rows = await this.fetchMutes();
    if (rows.length === 0) {
      return null;
    }

    return this.buildMessage(rows);
  }

  private async fetchMutes(): Promise<SelectNotificationMute[]> {
    if (this.status === 'fetching') {
      return [];
    }

    this.status = 'fetching';

    try {
      return await database
        .selectFrom('notification_mutes')
        .selectAll()
        .where('user_id', '=', this.user.userId)
        .where('revision', '>', this.cursor)
        .orderBy('revision', 'asc')
        .limit(100)
        .execute();
    } catch (error) {
      logger.error(error, 'Error fetching notification mutes for sync');
    } finally {
      this.status = 'pending';
    }

    return [];
  }

  private buildMessage(
    rows: SelectNotificationMute[]
  ): SynchronizerOutputMessage<SyncNotificationMutesInput> {
    const items: SyncNotificationMuteData[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      nodeId: row.node_id,
      workspaceId: row.workspace_id,
      muted: row.muted,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
      revision: row.revision.toString(),
    }));

    return {
      type: 'synchronizer.output',
      userId: this.user.userId,
      id: this.id,
      items: items.map((item) => ({ cursor: item.revision, data: item })),
    };
  }

  private shouldFetch(event: Event): boolean {
    return (
      event.type === 'notification.mute.updated' &&
      event.userId === this.user.userId
    );
  }
}
