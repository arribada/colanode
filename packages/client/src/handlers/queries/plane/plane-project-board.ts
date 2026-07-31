import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { PlaneProjectBoardQueryInput } from '@colanode/client/queries/plane/plane-project-board';
import { PlaneProjectBoardOutput } from '@colanode/core';

export class PlaneProjectBoardQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<PlaneProjectBoardQueryInput>
{
  public async handleQuery(
    input: PlaneProjectBoardQueryInput
  ): Promise<PlaneProjectBoardOutput | null> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/integrations/plane/project/${input.projectId}/board`
      )
      .json<PlaneProjectBoardOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<PlaneProjectBoardQueryInput>
  > {
    // The board's live state lives entirely on Plane, not in any local
    // Colanode table — nothing to subscribe to. Freshness comes from the
    // server-side cache TTL plus `useQuery` staleness on the UI side.
    return {
      hasChanges: false,
    };
  }
}
