import { describe, expect, it } from 'vitest';

import {
  buildChatRequest,
  buildToolChatRequest,
  parseAssistantTurn,
} from '@colanode/bot/provider/llm-provider';

describe('buildChatRequest', () => {
  it('prepends the system message before the dialog', () => {
    const body = buildChatRequest('gpt-x', 'be nice', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(body).toEqual({
      model: 'gpt-x',
      messages: [
        { role: 'system', content: 'be nice' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });
  });
});

describe('buildToolChatRequest', () => {
  it('serializes assistant tool_calls and tool results to OpenAI wire shape', () => {
    const body = buildToolChatRequest(
      'm',
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'c1', name: 'colanode_create_page', argumentsJson: '{"name":"X"}' },
          ],
        },
        { role: 'tool', toolCallId: 'c1', content: 'Created page pg1' },
      ],
      [
        {
          type: 'function',
          function: { name: 'colanode_create_page', description: 'd', parameters: {} },
        },
      ]
    );
    expect(body.tools).toHaveLength(1);
    const msgs = body.messages as Record<string, unknown>[];
    expect(msgs[2]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'colanode_create_page', arguments: '{"name":"X"}' },
        },
      ],
    });
    expect(msgs[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'Created page pg1' });
  });
});

describe('parseAssistantTurn', () => {
  it('returns text when the model replies without tools', () => {
    const turn = parseAssistantTurn({ choices: [{ message: { content: 'hello' } }] });
    expect(turn).toEqual({ text: 'hello', toolCalls: [] });
  });
  it('maps tool_calls to ToolCall[]', () => {
    const turn = parseAssistantTurn({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'c1', function: { name: 'colanode_list_nodes', arguments: '{}' } },
            ],
          },
        },
      ],
    });
    expect(turn.text).toBeNull();
    expect(turn.toolCalls).toEqual([
      { id: 'c1', name: 'colanode_list_nodes', argumentsJson: '{}' },
    ]);
  });
});
