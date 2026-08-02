// ABOUTME: Client query handler that proxies the current user's assigned Plane
// ABOUTME: issues from the server (GET .../integrations/plane/my-issues).
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { PlaneMyIssuesQueryInput } from '@colanode/client/queries/plane/plane-my-issues';
import { PlaneMyIssuesOutput } from '@colanode/core';

export class PlaneMyIssuesQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<PlaneMyIssuesQueryInput>
{
  public async handleQuery(
    input: PlaneMyIssuesQueryInput
  ): Promise<PlaneMyIssuesOutput> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/integrations/plane/my-issues`
      )
      .json<PlaneMyIssuesOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<PlaneMyIssuesQueryInput>
  > {
    // The issue list lives entirely on Plane, not in any local Colanode table —
    // nothing to subscribe to. Freshness comes from the server-side cache TTL
    // plus `useQuery` staleness on the UI side.
    return {
      hasChanges: false,
    };
  }
}
