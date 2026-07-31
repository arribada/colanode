import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { PlaneProjectsListQueryInput } from '@colanode/client/queries/plane/plane-projects-list';
import { PlaneProjectSummary } from '@colanode/core';

export class PlaneProjectsListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<PlaneProjectsListQueryInput>
{
  public async handleQuery(
    input: PlaneProjectsListQueryInput
  ): Promise<PlaneProjectSummary[]> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/integrations/plane/projects`
      )
      .json<PlaneProjectSummary[]>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<PlaneProjectsListQueryInput>
  > {
    // The project list lives entirely on Plane, not in any local Colanode
    // table — there's nothing to subscribe to. Freshness comes from the
    // server-side cache TTL plus `useQuery` staleness on the UI side.
    return {
      hasChanges: false,
    };
  }
}
