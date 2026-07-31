import { ChatMessage } from '@colanode/bot/provider/llm-provider';

export type DialogEntry = {
  createdBy: string;
  createdAt: string;
  text: string;
};

export const buildDialog = (
  entries: DialogEntry[],
  botUserId: string
): ChatMessage[] =>
  [...entries]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => ({
      role: entry.createdBy === botUserId ? 'assistant' : 'user',
      content: entry.text,
    }));
