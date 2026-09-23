import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  DocumentSnapshotCreateMutationInput,
  DocumentSnapshotCreateMutationOutput,
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class DocumentSnapshotCreateMutationHandler implements MutationHandler<DocumentSnapshotCreateMutationInput> {
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: DocumentSnapshotCreateMutationInput
  ): Promise<DocumentSnapshotCreateMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      return await workspaceService.account.client
        .post(
          `v1/workspaces/${workspaceService.workspace.workspaceId}/documents/${input.documentId}/snapshots`,
          {
            json: {
              name: input.name ?? null,
              note: input.note ?? null,
            },
          }
        )
        .json<DocumentSnapshotCreateMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
