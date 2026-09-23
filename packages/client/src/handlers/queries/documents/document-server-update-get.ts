import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { DocumentServerUpdateGetQueryInput } from '@colanode/client/queries/documents/document-server-update-get';
import { DocumentUpdateContentOutput } from '@colanode/core';

export class DocumentServerUpdateGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<DocumentServerUpdateGetQueryInput>
{
  public async handleQuery(
    input: DocumentServerUpdateGetQueryInput
  ): Promise<DocumentUpdateContentOutput | null> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .get(
          `v1/workspaces/${workspace.workspaceId}/documents/${input.documentId}/updates/${input.updateId}`
        )
        .json<DocumentUpdateContentOutput>();
    } catch {
      // The edit has been folded away since the list was fetched.
      return null;
    }
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<DocumentServerUpdateGetQueryInput>
  > {
    return {
      hasChanges: false,
    };
  }
}
