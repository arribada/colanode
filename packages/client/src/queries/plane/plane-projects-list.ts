import { PlaneProjectSummary } from '@colanode/core';

export type PlaneProjectsListQueryInput = {
  type: 'plane.projects.list';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'plane.projects.list': {
      input: PlaneProjectsListQueryInput;
      output: PlaneProjectSummary[];
    };
  }
}
