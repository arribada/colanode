export type PageTemplateCreateMutationInput = {
  type: 'page.template.create';
  userId: string;
  templateId: string;
  // The template's space. Also where the copy goes when parentId is omitted.
  spaceId: string;
  // The space itself, or a page or folder of it, to create the copy under.
  parentId?: string;
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
