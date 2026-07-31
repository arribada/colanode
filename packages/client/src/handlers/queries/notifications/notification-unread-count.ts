import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { NotificationUnreadCountQueryInput } from '@colanode/client/queries/notifications/notification-unread-count';
import { Event } from '@colanode/client/types/events';

export class NotificationUnreadCountQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NotificationUnreadCountQueryInput>
{
  public async handleQuery(
    input: NotificationUnreadCountQueryInput
  ): Promise<number> {
    const workspace = this.getWorkspace(input.userId);
    const row = await workspace.database
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', workspace.userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return row?.count ?? 0;
  }

  public async checkForChanges(
    event: Event,
    input: NotificationUnreadCountQueryInput,
    _: number
  ): Promise<ChangeCheckResult<NotificationUnreadCountQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return { hasChanges: true, result: 0 };
    }

    if (
      event.type === 'notification.created' &&
      event.workspace.userId === input.userId
    ) {
      const result = await this.handleQuery(input);
      return { hasChanges: true, result };
    }

    if (
      event.type === 'notification.read' &&
      event.workspace.userId === input.userId
    ) {
      const result = await this.handleQuery(input);
      return { hasChanges: true, result };
    }

    return { hasChanges: false };
  }
}
