import { ProjectCodeCheckOutput } from '@colanode/core';

// Whether a project code is free on the wiki, and what Plane has under that
// identifier.
export type ProjectCodeCheckQueryInput = {
  type: 'project.code.check';
  userId: string;
  code: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'project.code.check': {
      input: ProjectCodeCheckQueryInput;
      output: ProjectCodeCheckOutput;
    };
  }
}
