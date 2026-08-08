import { UnsplashSearchOutput } from '@colanode/core';

import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { UnsplashSearchQueryInput } from '@colanode/client/queries/unsplash/unsplash-search';
import { AppService } from '@colanode/client/services/app-service';

// Proxies an Unsplash photo search through the account's authenticated server
// client (`v1/unsplash/search`). The Unsplash Access Key lives only on the
// server, so the client never sees it. Results live entirely upstream — there
// is no local table to subscribe to — so `checkForChanges` reports nothing;
// freshness comes from the UI re-issuing the query as the (debounced) search
// term changes.
export class UnsplashSearchQueryHandler
  implements QueryHandler<UnsplashSearchQueryInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  public async handleQuery(
    input: UnsplashSearchQueryInput
  ): Promise<UnsplashSearchOutput> {
    const account = this.app.getAccount(input.accountId);
    if (!account) {
      return { results: [] };
    }

    const query = input.query.trim();
    if (query.length === 0) {
      return { results: [] };
    }

    try {
      const output = await account.client
        .get('v1/unsplash/search', {
          searchParams: {
            query,
            page: input.page ?? 1,
          },
        })
        .json<UnsplashSearchOutput>();

      return output;
    } catch {
      // Network / server error → degrade gracefully so the picker can render
      // an "unavailable" state instead of throwing.
      return { results: [], error: 'unavailable' };
    }
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<UnsplashSearchQueryInput>
  > {
    return {
      hasChanges: false,
    };
  }
}
