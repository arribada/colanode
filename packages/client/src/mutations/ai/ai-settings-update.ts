import { AiProviderName, AiUserSettingsOutput } from '@colanode/core';

export type AiSettingsUpdateMutationInput = {
  type: 'ai.settings.update';
  userId: string;
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  // Omit or send an empty string to keep the previously stored key.
  apiKey?: string;
};

export type AiSettingsUpdateMutationOutput = AiUserSettingsOutput;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.settings.update': {
      input: AiSettingsUpdateMutationInput;
      output: AiSettingsUpdateMutationOutput;
    };
  }
}
