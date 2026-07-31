import { SelectNotification } from '@colanode/client/databases';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { NotificationListQueryInput } from '@colanode/client/queries/notifications/notification-list';
import { Event } from '@colanode/client/types/events';

export class NotificationListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NotificationListQueryInput>
{
  public async handleQuery(
    input: NotificationListQueryInput
  ): Promise<SelectNotification[]> {
    const workspace = this.getWorkspace(input.userId);
    return workspace.database
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', workspace.userId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  public async checkForChanges(
    event: Event,
    input: NotificationListQueryInput,
    _: SelectNotification[]
  ): Promise<ChangeCheckResult<NotificationListQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return { hasChanges: true, result: [] };
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
