export type FileUploadRetryMutationInput = {
  type: 'file.upload.retry';
  userId: string;
  fileId: string;
};

export type FileUploadRetryMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'file.upload.retry': {
      input: FileUploadRetryMutationInput;
      output: FileUploadRetryMutationOutput;
    };
  }
}
