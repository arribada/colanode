import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { NodeSnapshotListQueryInput } from '@colanode/client/queries/nodes/node-snapshot-list';
import {
  NodeSnapshotListOutput,
  NodeSnapshotSummary,
} from '@colanode/core';

export class NodeSnapshotListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeSnapshotListQueryInput>
{
  public async handleQuery(
    input: NodeSnapshotListQueryInput
  ): Promise<NodeSnapshotSummary[]> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/nodes/${input.nodeId}/snapshots`
      )
      .json<NodeSnapshotListOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<NodeSnapshotListQueryInput>
  > {
    // Snapshots are server-only data written by a background job; there is
    // no client event that signals a change, so consumers refetch on open.
    return {
      hasChanges: false,
    };
  }
}
