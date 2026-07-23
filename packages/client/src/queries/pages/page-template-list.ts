import { LocalPageNode } from '@colanode/client/types/nodes';

export type PageTemplateListQueryInput = {
  type: 'page.template.list';
  userId: string;
  spaceId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'page.template.list': {
      input: PageTemplateListQueryInput;
      output: LocalPageNode[];
    };
  }
}
