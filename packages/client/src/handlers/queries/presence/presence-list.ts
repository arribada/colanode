import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { PresenceListQueryInput } from '@colanode/client/queries';
import { AppService } from '@colanode/client/services/app-service';
import { Event } from '@colanode/client/types/events';
import { PresenceState } from '@colanode/core';

export class PresenceListQueryHandler
  implements QueryHandler<PresenceListQueryInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleQuery(input: PresenceListQueryInput): Promise<PresenceState[]> {
    const workspace = this.app.getWorkspace(input.userId);
    if (!workspace) {
      return [];
    }
    return workspace.account.presence.getPresences(input.nodeId);
  }

  async checkForChanges(
    event: Event,
    input: PresenceListQueryInput,
    _output: PresenceState[]
  ): Promise<ChangeCheckResult<PresenceListQueryInput>> {
    if (event.type === 'presence.changed' && event.nodeId === input.nodeId) {
      const workspace = this.app.getWorkspace(input.userId);
      if (!workspace || workspace.account.id !== event.accountId) {
        return { hasChanges: false };
      }
      return {
        hasChanges: true,
        result: event.presences,
      };
    }

    if (
      event.type === 'account.connection.closed' ||
      event.type === 'workspace.deleted'
    ) {
      return { hasChanges: true, result: [] };
    }

    return { hasChanges: false };
  }
}
