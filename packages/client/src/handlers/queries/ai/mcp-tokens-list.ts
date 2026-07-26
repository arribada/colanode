import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { McpTokensListQueryInput } from '@colanode/client/queries/ai/mcp-tokens-list';
import { McpTokensListOutput } from '@colanode/core';

export class McpTokensListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<McpTokensListQueryInput>
{
  public async handleQuery(
    input: McpTokensListQueryInput
  ): Promise<McpTokensListOutput> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(`v1/workspaces/${workspace.workspaceId}/ai/mcp/tokens`)
      .json<McpTokensListOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<McpTokensListQueryInput>
  > {
    // MCP tokens live only on the server; there is no local table to subscribe
    // to. A UI re-runs this query after create/revoke mutations instead.
    return {
      hasChanges: false,
    };
  }
}
