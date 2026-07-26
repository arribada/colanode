import { AiCompletionAction } from '@colanode/core';

export type AiCompleteMutationInput = {
  type: 'ai.complete';
  userId: string;
  action: AiCompletionAction;
  // Free-form instruction. Required for 'custom'; target language for
  // 'translate'; ignored otherwise.
  prompt?: string;
  // The editor selection the action operates on.
  selection?: string;
  // Surrounding document text, for grounding.
  context?: string;
};

export type AiCompleteMutationOutput = {
  text: string;
  provider: string;
  model: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.complete': {
      input: AiCompleteMutationInput;
      output: AiCompleteMutationOutput;
    };
  }
}
