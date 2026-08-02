// ABOUTME: Client query descriptor for the current user's assigned Plane
// ABOUTME: issues, rendered in the wiki home "My Plane tickets" section.
import { PlaneMyIssuesOutput } from '@colanode/core';

export type PlaneMyIssuesQueryInput = {
  type: 'plane.my.issues';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'plane.my.issues': {
      input: PlaneMyIssuesQueryInput;
      output: PlaneMyIssuesOutput;
    };
  }
}
