import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import {
  NodePaths,
  fetchNodePaths,
  sameNodePaths,
} from '@colanode/client/lib/node-paths';
import { NodePathListQueryInput } from '@colanode/client/queries/nodes/node-path-list';
import { Event } from '@colanode/client/types/events';

export class NodePathListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodePathListQueryInput>
{
  public async handleQuery(input: NodePathListQueryInput): Promise<NodePaths> {
    const workspace = this.getWorkspace(input.userId);
    return fetchNodePaths(workspace.database, input.nodeIds);
  }

  public async checkForChanges(
    event: Event,
    input: NodePathListQueryInput,
    output: NodePaths
  ): Promise<ChangeCheckResult<NodePathListQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: {},
      };
    }

    // Any rename or move on the way up changes a path, and an ancestor that
    // syncs in late completes one. The walk is a handful of primary-key
    // lookups, so it is re-run and only reported when a path really changed.
    if (
      (event.type === 'node.created' ||
        event.type === 'node.updated' ||
        event.type === 'node.deleted') &&
      event.workspace.userId === input.userId
    ) {
      const result = await this.handleQuery(input);
      if (sameNodePaths(output, result)) {
        return {
          hasChanges: false,
        };
      }

      return {
        hasChanges: true,
        result,
      };
    }

    return {
      hasChanges: false,
    };
  }
}
