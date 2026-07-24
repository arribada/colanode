import { PlaneIssueOutput } from '@colanode/core';

export type PlaneIssueGetQueryInput = {
  type: 'plane.issue.get';
  userId: string;
  // The raw Plane issue URL the user pasted — parsed and resolved
  // server-side (see the `/integrations/plane/issue` proxy route) so the
  // Plane API token never has to reach the client.
  url: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'plane.issue.get': {
      input: PlaneIssueGetQueryInput;
      output: PlaneIssueOutput | null;
    };
  }
}
