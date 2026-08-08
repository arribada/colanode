import { UnsplashSearchOutput } from '@colanode/core';

export type UnsplashSearchQueryInput = {
  type: 'unsplash.search';
  accountId: string;
  // The user's search terms. An empty/whitespace query short-circuits to an
  // empty result set (no upstream call) — see the handler.
  query: string;
  page?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'unsplash.search': {
      input: UnsplashSearchQueryInput;
      output: UnsplashSearchOutput;
    };
  }
}
