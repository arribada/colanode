import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { DocumentSnapshotListQueryInput } from '@colanode/client/queries/documents/document-snapshot-list';
import {
  DocumentSnapshotListOutput,
  DocumentSnapshotSummary,
} from '@colanode/core';

export class DocumentSnapshotListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<DocumentSnapshotListQueryInput>
{
  public async handleQuery(
    input: DocumentSnapshotListQueryInput
  ): Promise<DocumentSnapshotSummary[]> {
    const workspace = this.getWorkspace(input.userId);

    const output = await workspace.account.client
      .get(
        `v1/workspaces/${workspace.workspaceId}/documents/${input.documentId}/snapshots`
      )
      .json<DocumentSnapshotListOutput>();

    return output;
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<DocumentSnapshotListQueryInput>
  > {
    // Snapshots are server-only data written by a background job; there is
    // no client event that signals a change, so consumers refetch on open.
    return {
      hasChanges: false,
    };
  }
}
