export type PageTemplateCreateMutationInput = {
  type: 'page.template.create';
  userId: string;
  templateId: string;
  spaceId: string;
};

export type PageTemplateCreateMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'page.template.create': {
      input: PageTemplateCreateMutationInput;
      output: PageTemplateCreateMutationOutput;
    };
  }
}
