import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { mapNodeInteraction } from '@colanode/client/lib/mappers';
import { NodeInteractionGetQueryInput } from '@colanode/client/queries/interactions/node-interaction-get';
import { Event } from '@colanode/client/types/events';
import { NodeInteraction } from '@colanode/client/types/nodes';

export class NodeInteractionGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeInteractionGetQueryInput>
{
  public async handleQuery(
    input: NodeInteractionGetQueryInput
  ): Promise<NodeInteraction | null> {
    return this.fetchNodeInteraction(input);
  }

  public async checkForChanges(
    event: Event,
    input: NodeInteractionGetQueryInput,
    _: NodeInteraction | null
  ): Promise<ChangeCheckResult<NodeInteractionGetQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: null,
      };
    }

    if (
      event.type === 'node.interaction.updated' &&
      event.workspace.userId === input.userId &&
      event.nodeInteraction.nodeId === input.nodeId
    ) {
      const newResult = await this.handleQuery(input);

      return {
        hasChanges: true,
        result: newResult,
      };
    }

    return {
      hasChanges: false,
    };
  }

  private async fetchNodeInteraction(
    input: NodeInteractionGetQueryInput
  ): Promise<NodeInteraction | null> {
    const workspace = this.getWorkspace(input.userId);

    const row = await workspace.database
      .selectFrom('node_interactions')
      .selectAll()
      .where('node_id', '=', input.nodeId)
      .where('collaborator_id', '=', input.userId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return mapNodeInteraction(row);
  }
}
