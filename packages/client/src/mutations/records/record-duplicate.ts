export type RecordDuplicateMutationInput = {
  type: 'record.duplicate';
  userId: string;
  recordId: string;
};

export type RecordDuplicateMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'record.duplicate': {
      input: RecordDuplicateMutationInput;
      output: RecordDuplicateMutationOutput;
    };
  }
}
