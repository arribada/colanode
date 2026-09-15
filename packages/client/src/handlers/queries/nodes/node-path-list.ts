import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import {
  NodePaths,
  fetchNodePaths,
  isParentOfAny,
  pathsMention,
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

    // A rename, move or delete matters only when it touches a listed node or
    // one of its ancestors; a created node only when it is the missing parent
    // of one. Re-walking every path on every event cost seconds of worker time
    // per open list during a first sync, when thousands of nodes arrive.
    if (
      (event.type === 'node.created' ||
        event.type === 'node.updated' ||
        event.type === 'node.deleted') &&
      event.workspace.userId === input.userId
    ) {
      // A failure here must not escape: an exception inside a change check
      // stops every live query from updating.
      try {
        const relevant =
          pathsMention(event.node.id, input.nodeIds, output) ||
          (event.type === 'node.created' &&
            (await isParentOfAny(
              this.getWorkspace(input.userId).database,
              event.node.id,
              input.nodeIds,
              output
            )));

        if (!relevant) {
          return {
            hasChanges: false,
          };
        }

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
      } catch {
        return {
          hasChanges: false,
        };
      }
    }

    return {
      hasChanges: false,
    };
  }
}
