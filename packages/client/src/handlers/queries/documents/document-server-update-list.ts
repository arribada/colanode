import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { DocumentServerUpdateListQueryInput } from '@colanode/client/queries/documents/document-server-update-list';
import {
  DocumentUpdateListOutput,
  DocumentUpdateSummary,
} from '@colanode/core';

export class DocumentServerUpdateListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<DocumentServerUpdateListQueryInput>
{
  public async handleQuery(
    input: DocumentServerUpdateListQueryInput
  ): Promise<DocumentUpdateSummary[]> {
    const workspace = this.getWorkspace(input.userId);

    return await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/documents/${input.documentId}/updates`
      )
      .json<DocumentUpdateListOutput>();
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<DocumentServerUpdateListQueryInput>
  > {
    // Server-side history: there is no local event for it, so it is refetched
    // when the dialog opens.
    return {
      hasChanges: false,
    };
  }
}
