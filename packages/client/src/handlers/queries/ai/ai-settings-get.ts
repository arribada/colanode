import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { AiSettingsGetQueryInput } from '@colanode/client/queries/ai/ai-settings-get';
import { AiUserSettingsOutput } from '@colanode/core';

export class AiSettingsGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<AiSettingsGetQueryInput>
{
  public async handleQuery(
    input: AiSettingsGetQueryInput
  ): Promise<AiUserSettingsOutput> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(`v1/workspaces/${workspace.workspaceId}/ai/settings`)
      .json<AiUserSettingsOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<AiSettingsGetQueryInput>
  > {
    // The user's AI settings live only on the server; there is no local table
    // to subscribe to. The settings UI re-runs this query after a successful
    // ai.settings.update mutation instead.
    return {
      hasChanges: false,
    };
  }
}
