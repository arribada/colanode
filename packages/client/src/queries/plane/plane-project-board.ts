import { PlaneProjectBoardOutput } from '@colanode/core';

export type PlaneProjectBoardQueryInput = {
  type: 'plane.project.board';
  userId: string;
  // The Plane project UUID whose board (states + issues) to fetch — resolved
  // server-side (see the `/integrations/plane/project/:projectId/board` proxy
  // route) so the Plane API token never reaches the client.
  projectId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'plane.project.board': {
      input: PlaneProjectBoardQueryInput;
      output: PlaneProjectBoardOutput | null;
    };
  }
}
