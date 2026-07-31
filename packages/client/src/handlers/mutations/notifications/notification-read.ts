import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  NotificationReadMutationInput,
  NotificationReadMutationOutput,
} from '@colanode/client/mutations/notifications/notification-read';

export class NotificationReadMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<NotificationReadMutationInput>
{
  async handleMutation(
    input: NotificationReadMutationInput
  ): Promise<NotificationReadMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    await workspace.notifications.markAsRead(input.notificationId);
    return { success: true };
  }
}
