export type RecordTemplateSaveMutationInput = {
  type: 'record.template.save';
  userId: string;
  recordId: string;
};

export type RecordTemplateSaveMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'record.template.save': {
      input: RecordTemplateSaveMutationInput;
      output: RecordTemplateSaveMutationOutput;
    };
  }
}
