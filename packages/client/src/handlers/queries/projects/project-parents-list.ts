import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { ProjectParentsListQueryInput } from '@colanode/client/queries/projects/project-parents-list';
import { ProjectParent } from '@colanode/core';

export class ProjectParentsListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<ProjectParentsListQueryInput>
{
  public async handleQuery(
    input: ProjectParentsListQueryInput
  ): Promise<ProjectParent[]> {
    const workspace = this.getWorkspace(input.userId);
    return await workspace.account.client
      .get(`v1/workspaces/${workspace.workspaceId}/projects/parents`)
      .json<ProjectParent[]>();
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<ProjectParentsListQueryInput>
  > {
    // Asked of the server each time the dialog opens; nothing local to watch.
    return { hasChanges: false };
  }
}
