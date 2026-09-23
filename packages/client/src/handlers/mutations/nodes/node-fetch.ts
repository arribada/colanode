import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  MutationError,
  MutationErrorCode,
  NodeFetchMutationInput,
  NodeFetchMutationOutput,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';
import { SyncDocumentUpdateData, SyncNodeUpdateData } from '@colanode/core';

type NodeSyncOutput = {
  trashed?: boolean;
  nodes: SyncNodeUpdateData[];
  documents: SyncDocumentUpdateData[];
};

// Pulls one node ahead of the stream. A cold client receives every space in
// revision order, so the page the user just opened can be minutes away; this
// asks the server for that page alone and feeds the rows to the very same
// appliers the stream uses, which are idempotent and keep their own ordering
// rules. The sync cursors are left alone, so the stream still delivers
// everything in its own time.
export class NodeFetchMutationHandler implements MutationHandler<NodeFetchMutationInput> {
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: NodeFetchMutationInput
  ): Promise<NodeFetchMutationOutput> {
    const workspace = this.app.getWorkspace(input.userId);
    if (!workspace) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    let output: NodeSyncOutput;
    try {
      output = await workspace.account.client
        .get(
          `v1/workspaces/${workspace.workspace.workspaceId}/nodes/${input.nodeId}/sync`
        )
        .json<NodeSyncOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }

    // In revision order, exactly as the stream would send them: a node is
    // built from the first update it receives, so its create must come first.
    for (const update of output.nodes) {
      await workspace.nodes.syncServerNodeUpdate(update);
    }

    for (const update of output.documents) {
      await workspace.documents.syncServerDocumentUpdate(update);
    }

    return {
      nodes: output.nodes.length,
      documents: output.documents.length,
      trashed: output.trashed ?? false,
    };
  }
}
