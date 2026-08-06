import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  DocumentSuggestionResolveMutationInput,
  DocumentSuggestionResolveMutationOutput,
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class DocumentSuggestionResolveMutationHandler
  implements MutationHandler<DocumentSuggestionResolveMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: DocumentSuggestionResolveMutationInput
  ): Promise<DocumentSuggestionResolveMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      await workspaceService.account.client.patch(
        `v1/workspaces/${workspaceService.workspace.workspaceId}/suggestions/${input.suggestionId}`,
        { json: { status: input.status } }
      );
      return { success: true };
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
