import { AiWorkspaceSettingsOutput } from '@colanode/core';

export type AiSettingsWorkspaceGetQueryInput = {
  type: 'ai.settings.workspace.get';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'ai.settings.workspace.get': {
      input: AiSettingsWorkspaceGetQueryInput;
      output: AiWorkspaceSettingsOutput;
    };
  }
}
