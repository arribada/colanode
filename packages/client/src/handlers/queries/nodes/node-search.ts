import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { searchNodes } from '@colanode/client/lib/node-search';
import {
  NodeSearchOutput,
  NodeSearchQueryInput,
} from '@colanode/client/queries/nodes/node-search';
import { Event } from '@colanode/client/types/events';

export class NodeSearchQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeSearchQueryInput>
{
  public async handleQuery(
    input: NodeSearchQueryInput
  ): Promise<NodeSearchOutput> {
    const workspace = this.getWorkspace(input.userId);
    return searchNodes(workspace.database, {
      searchQuery: input.searchQuery,
      limit: input.limit,
      sort: input.sort,
      filters: input.filters,
    });
  }

  public async checkForChanges(
    event: Event,
    input: NodeSearchQueryInput,
    _: NodeSearchOutput
  ): Promise<ChangeCheckResult<NodeSearchQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: { results: [], total: 0 },
      };
    }

    if (
      (event.type === 'node.created' ||
        event.type === 'node.updated' ||
        event.type === 'node.deleted' ||
        event.type === 'document.updated' ||
        event.type === 'document.deleted') &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: await this.handleQuery(input),
      };
    }

    return {
      hasChanges: false,
    };
  }
}
