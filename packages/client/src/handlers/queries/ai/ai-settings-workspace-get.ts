import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { AiSettingsWorkspaceGetQueryInput } from '@colanode/client/queries/ai/ai-settings-workspace-get';
import { AiWorkspaceSettingsOutput } from '@colanode/core';

export class AiSettingsWorkspaceGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<AiSettingsWorkspaceGetQueryInput>
{
  public async handleQuery(
    input: AiSettingsWorkspaceGetQueryInput
  ): Promise<AiWorkspaceSettingsOutput> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(`v1/workspaces/${workspace.workspaceId}/ai/settings/workspace`)
      .json<AiWorkspaceSettingsOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<AiSettingsWorkspaceGetQueryInput>
  > {
    // The workspace AI settings live only on the server; there is no local
    // table to subscribe to. The settings UI re-runs this query after a
    // successful ai.settings.workspace.update mutation instead.
    return {
      hasChanges: false,
    };
  }
}
