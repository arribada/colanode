import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  DocumentSuggestionCreateMutationInput,
  DocumentSuggestionCreateMutationOutput,
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class DocumentSuggestionCreateMutationHandler
  implements MutationHandler<DocumentSuggestionCreateMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: DocumentSuggestionCreateMutationInput
  ): Promise<DocumentSuggestionCreateMutationOutput> {
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
          `v1/workspaces/${workspaceService.workspace.workspaceId}/suggestions`,
          {
            json: {
              nodeId: input.nodeId,
              blockId: input.blockId,
              scope: input.scope,
              proposedContent: input.proposedContent,
              previewText: input.previewText,
            },
          }
        )
        .json<DocumentSuggestionCreateMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
