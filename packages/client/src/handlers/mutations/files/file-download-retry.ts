import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  FileDownloadRetryMutationInput,
  FileDownloadRetryMutationOutput,
} from '@colanode/client/mutations';

export class FileDownloadRetryMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<FileDownloadRetryMutationInput>
{
  async handleMutation(
    input: FileDownloadRetryMutationInput
  ): Promise<FileDownloadRetryMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const success = await workspace.files.retryDownload(input.downloadId);

    return {
      success,
    };
  }
}
