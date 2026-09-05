import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  FileUploadRetryMutationInput,
  FileUploadRetryMutationOutput,
} from '@colanode/client/mutations';

export class FileUploadRetryMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<FileUploadRetryMutationInput>
{
  async handleMutation(
    input: FileUploadRetryMutationInput
  ): Promise<FileUploadRetryMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const success = await workspace.files.retryUpload(input.fileId);

    return {
      success,
    };
  }
}
