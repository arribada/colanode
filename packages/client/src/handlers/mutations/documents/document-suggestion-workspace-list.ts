import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  DocumentSuggestionWorkspaceListMutationInput,
  DocumentSuggestionWorkspaceListMutationOutput,
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class DocumentSuggestionWorkspaceListMutationHandler
  implements MutationHandler<DocumentSuggestionWorkspaceListMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: DocumentSuggestionWorkspaceListMutationInput
  ): Promise<DocumentSuggestionWorkspaceListMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      return await workspaceService.account.client
        .get(
          `v1/workspaces/${workspaceService.workspace.workspaceId}/suggestions/all`
        )
        .json<DocumentSuggestionWorkspaceListMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
