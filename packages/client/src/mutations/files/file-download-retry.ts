export type FileDownloadRetryMutationInput = {
  type: 'file.download.retry';
  userId: string;
  downloadId: string;
};

export type FileDownloadRetryMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'file.download.retry': {
      input: FileDownloadRetryMutationInput;
      output: FileDownloadRetryMutationOutput;
    };
  }
}
