import { AiUserSettingsOutput } from '@colanode/core';

export type AiSettingsGetQueryInput = {
  type: 'ai.settings.get';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'ai.settings.get': {
      input: AiSettingsGetQueryInput;
      output: AiUserSettingsOutput;
    };
  }
}
