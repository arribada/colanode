export type PageDuplicateMutationInput = {
  type: 'page.duplicate';
  userId: string;
  pageId: string;
};

export type PageDuplicateMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'page.duplicate': {
      input: PageDuplicateMutationInput;
      output: PageDuplicateMutationOutput;
    };
  }
}
