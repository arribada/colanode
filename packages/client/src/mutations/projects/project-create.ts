import {
  ProjectCreateOutput,
  ProjectPlaneMode,
  ProjectSource,
  ProjectTemplateKind,
} from '@colanode/core';

// Creates a project from the template; see apps/server/src/lib/projects.
export type ProjectCreateMutationInput = {
  type: 'project.create';
  userId: string;
  parentId: string;
  name: string;
  code: string;
  plane: ProjectPlaneMode;
  template?: ProjectTemplateKind;
  source?: ProjectSource | null;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'project.create': {
      input: ProjectCreateMutationInput;
      output: ProjectCreateOutput;
    };
  }
}
