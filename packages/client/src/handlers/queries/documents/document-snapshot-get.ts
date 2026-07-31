import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { DocumentSnapshotGetQueryInput } from '@colanode/client/queries/documents/document-snapshot-get';
import { DocumentSnapshotOutput } from '@colanode/core';

export class DocumentSnapshotGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<DocumentSnapshotGetQueryInput>
{
  public async handleQuery(
    input: DocumentSnapshotGetQueryInput
  ): Promise<DocumentSnapshotOutput | null> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/documents/${input.documentId}/snapshots/${input.snapshotId}`
      )
      .json<DocumentSnapshotOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<DocumentSnapshotGetQueryInput>
  > {
    // Snapshots are immutable server-side rows; once fetched they never
    // change.
    return {
      hasChanges: false,
    };
  }
}
