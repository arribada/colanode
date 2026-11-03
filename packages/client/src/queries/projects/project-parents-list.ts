import { ProjectParent } from '@colanode/core';

// The missions and product lines a new project can be created under.
export type ProjectParentsListQueryInput = {
  type: 'project.parents.list';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'project.parents.list': {
      input: ProjectParentsListQueryInput;
      output: ProjectParent[];
    };
  }
}
