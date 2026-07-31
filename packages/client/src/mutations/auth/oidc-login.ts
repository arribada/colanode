import { LoginOutput } from '@colanode/core';

export type OidcLoginMutationInput = {
  type: 'oidc.login';
  server: string;
  code: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'oidc.login': {
      input: OidcLoginMutationInput;
      output: LoginOutput;
    };
  }
}
