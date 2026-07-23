export type PageTemplateSaveMutationInput = {
  type: 'page.template.save';
  userId: string;
  pageId: string;
};

export type PageTemplateSaveMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'page.template.save': {
      input: PageTemplateSaveMutationInput;
      output: PageTemplateSaveMutationOutput;
    };
  }
}
