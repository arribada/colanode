import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { PlaneIssueGetQueryInput } from '@colanode/client/queries/plane/plane-issue-get';
import { PlaneIssueOutput } from '@colanode/core';

export class PlaneIssueGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<PlaneIssueGetQueryInput>
{
  public async handleQuery(
    input: PlaneIssueGetQueryInput
  ): Promise<PlaneIssueOutput | null> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(`v1/workspaces/${workspace.workspaceId}/integrations/plane/issue`, {
        searchParams: { url: input.url },
      })
      .json<PlaneIssueOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<PlaneIssueGetQueryInput>
  > {
    // The issue's live state lives entirely on Plane, not in any local
    // Colanode table — there's nothing to subscribe to here. Freshness for
    // an open chip comes from `useQuery` polling on the UI side instead.
    return {
      hasChanges: false,
    };
  }
}
