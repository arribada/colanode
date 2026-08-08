export type UnsplashDownloadMutationInput = {
  type: 'unsplash.download';
  accountId: string;
  // The selected photo's Unsplash `download_location` endpoint, pinged
  // server-side to satisfy the Unsplash API "trigger a download" guideline.
  downloadLocation: string;
};

export type UnsplashDownloadMutationOutput = {
  ok: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'unsplash.download': {
      input: UnsplashDownloadMutationInput;
      output: UnsplashDownloadMutationOutput;
    };
  }
}
