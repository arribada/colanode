import { AiAgentAction } from '@colanode/core';

export type AiAgentMutationInput = {
  type: 'ai.agent';
  userId: string;
  // The user's instruction/question for the wiki agent.
  message: string;
  // The editor selection, if any (the agent operates in that context).
  selection?: string;
  // The node id of the page the user is currently on, if any.
  pageId?: string;
  // Extra grounding context (e.g. surrounding document text).
  context?: string;
};

export type AiAgentMutationOutput = {
  text: string;
  actions: AiAgentAction[];
  provider: string;
  model: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.agent': {
      input: AiAgentMutationInput;
      output: AiAgentMutationOutput;
    };
  }
}
