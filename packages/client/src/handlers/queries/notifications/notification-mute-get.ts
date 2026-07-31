import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { NotificationMuteGetQueryInput } from '@colanode/client/queries/notifications/notification-mute-get';
import { Event } from '@colanode/client/types/events';

export class NotificationMuteGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NotificationMuteGetQueryInput>
{
  public async handleQuery(
    input: NotificationMuteGetQueryInput
  ): Promise<{ muted: boolean }> {
    const workspace = this.getWorkspace(input.userId);
    const row = await workspace.database
      .selectFrom('notification_mutes')
      .select(['muted'])
      .where('node_id', '=', input.nodeId)
      .executeTakeFirst();
    return { muted: row ? row.muted === 1 : false };
  }

  public async checkForChanges(
    event: Event,
    input: NotificationMuteGetQueryInput,
    _: { muted: boolean }
  ): Promise<ChangeCheckResult<NotificationMuteGetQueryInput>> {
    if (
      event.type === 'notification.mute.updated' &&
      event.workspace.userId === input.userId &&
      event.nodeId === input.nodeId
    ) {
      return { hasChanges: true, result: await this.handleQuery(input) };
    }

    return { hasChanges: false };
  }
}
