import { MutationHandler } from '@colanode/client/lib/types';
import {
  UnsplashDownloadMutationInput,
  UnsplashDownloadMutationOutput,
} from '@colanode/client/mutations/unsplash/unsplash-download';
import { AppService } from '@colanode/client/services/app-service';

// Fires the server-side Unsplash "trigger download" ping (`v1/unsplash/
// download`) when a user selects an Unsplash photo as a cover. Best-effort:
// the required API-guideline ping should never surface an error to the user,
// so every failure path resolves to `{ ok: true }`.
export class UnsplashDownloadMutationHandler
  implements MutationHandler<UnsplashDownloadMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: UnsplashDownloadMutationInput
  ): Promise<UnsplashDownloadMutationOutput> {
    const account = this.app.getAccount(input.accountId);
    if (!account) {
      return { ok: true };
    }

    try {
      await account.client.post('v1/unsplash/download', {
        json: { downloadLocation: input.downloadLocation },
      });
    } catch {
      // Fire-and-forget — swallow any error.
    }

    return { ok: true };
  }
}
