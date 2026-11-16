import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';


import { withoutReasoningParts } from '@colanode/server/lib/ai/agent';

describe('withoutReasoningParts', () => {
  it('drops the reasoning parts of an assistant turn and keeps its text and tool calls', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Search pages about Help.' },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'The user wants a search; call the tool.' },
          { type: 'text', text: 'Searching…' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'search_pages',
            input: { query: 'Help' },
          },
        ],
      },
    ];

    const result = withoutReasoningParts(messages);

    const assistant = result[1];
    expect(assistant?.role).toBe('assistant');
    expect(Array.isArray(assistant?.content)).toBe(true);
    const types = (assistant?.content as Array<{ type: string }>).map(
      (part) => part.type
    );
    expect(types).toEqual(['text', 'tool-call']);
  });

  it('leaves user turns and plain-string assistant turns untouched', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    expect(withoutReasoningParts(messages)).toEqual(messages);
  });

  it('does not mutate the messages it is given', () => {
    const content = [{ type: 'reasoning' as const, text: 'hmm' }];
    const messages: ModelMessage[] = [{ role: 'assistant', content }];

    withoutReasoningParts(messages);

    expect(content).toHaveLength(1);
  });
});
