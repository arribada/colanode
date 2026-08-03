import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { NodeSnapshotGetQueryInput } from '@colanode/client/queries/nodes/node-snapshot-get';
import { NodeSnapshotOutput } from '@colanode/core';

export class NodeSnapshotGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeSnapshotGetQueryInput>
{
  public async handleQuery(
    input: NodeSnapshotGetQueryInput
  ): Promise<NodeSnapshotOutput | null> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/nodes/${input.nodeId}/snapshots/${input.snapshotId}`
      )
      .json<NodeSnapshotOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<NodeSnapshotGetQueryInput>
  > {
    // Snapshots are immutable server-side rows; once fetched they never
    // change.
    return {
      hasChanges: false,
    };
  }
}
