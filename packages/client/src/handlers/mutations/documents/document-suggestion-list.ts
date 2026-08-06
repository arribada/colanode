import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  DocumentSuggestionItem,
  DocumentSuggestionListMutationInput,
  DocumentSuggestionListMutationOutput,
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export class DocumentSuggestionListMutationHandler
  implements MutationHandler<DocumentSuggestionListMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: DocumentSuggestionListMutationInput
  ): Promise<DocumentSuggestionListMutationOutput> {
    const workspaceService = this.app.getWorkspace(input.userId);
    if (!workspaceService) {
      throw new MutationError(
        MutationErrorCode.WorkspaceNotFound,
        'Workspace not found.'
      );
    }

    try {
      const suggestions = await workspaceService.account.client
        .get(
          `v1/workspaces/${workspaceService.workspace.workspaceId}/suggestions`,
          { searchParams: { nodeId: input.nodeId } }
        )
        .json<DocumentSuggestionItem[]>();
      return { suggestions };
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
