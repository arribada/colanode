import { ProjectAlignOutput, ProjectPlaneMode } from '@colanode/core';

// Aligns an existing page on the project template. apply=false only
// returns the plan.
export type ProjectAlignMutationInput = {
  type: 'project.align';
  userId: string;
  pageId: string;
  code: string;
  apply: boolean;
  plane: ProjectPlaneMode;
  aliases?: string[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'project.align': {
      input: ProjectAlignMutationInput;
      output: ProjectAlignOutput;
    };
  }
}
