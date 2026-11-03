import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { ProjectCodeCheckQueryInput } from '@colanode/client/queries/projects/project-code-check';
import { ProjectCodeCheckOutput } from '@colanode/core';

export class ProjectCodeCheckQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<ProjectCodeCheckQueryInput>
{
  public async handleQuery(
    input: ProjectCodeCheckQueryInput
  ): Promise<ProjectCodeCheckOutput> {
    const workspace = this.getWorkspace(input.userId);
    return await workspace.account.client
      .get(`v1/workspaces/${workspace.workspaceId}/projects/code`, {
        searchParams: { code: input.code },
      })
      .json<ProjectCodeCheckOutput>();
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<ProjectCodeCheckQueryInput>
  > {
    // The answer depends on Plane as much as on the wiki: it is asked again
    // when the code changes, never pushed.
    return { hasChanges: false };
  }
}
