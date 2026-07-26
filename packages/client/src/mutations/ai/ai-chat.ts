import { AiAgentAction } from '@colanode/core';

// A single turn in the running chat transcript sent to POST …/ai/chat.
export type AiChatMessageInput = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiChatMutationInput = {
  type: 'ai.chat';
  userId: string;
  // The running conversation transcript. Must include at least the latest user
  // turn; may include prior turns. Only the latest turn runs fresh tools.
  messages: AiChatMessageInput[];
  // The node id of the page the user is currently viewing, if any.
  pageId?: string;
  // The editor selection, if any (treated as the current context).
  selection?: string;
  // Extra grounding context (e.g. surrounding document text).
  context?: string;
};

export type AiChatMutationOutput = {
  text: string;
  actions: AiAgentAction[];
  provider: string;
  model: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.chat': {
      input: AiChatMutationInput;
      output: AiChatMutationOutput;
    };
  }
}
