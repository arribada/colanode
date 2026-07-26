import { AiProviderName, AiWorkspaceSettingsOutput } from '@colanode/core';

export type AiSettingsWorkspaceUpdateMutationInput = {
  type: 'ai.settings.workspace.update';
  userId: string;
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  // Omit or send an empty string to keep the previously stored key.
  apiKey?: string;
};

export type AiSettingsWorkspaceUpdateMutationOutput = AiWorkspaceSettingsOutput;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.settings.workspace.update': {
      input: AiSettingsWorkspaceUpdateMutationInput;
      output: AiSettingsWorkspaceUpdateMutationOutput;
    };
  }
}
