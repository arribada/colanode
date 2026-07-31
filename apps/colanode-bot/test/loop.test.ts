import { describe, expect, it } from 'vitest';
import { Tool, ToolContext } from '@colanode/agent-tools';
import {
  ChatMessage,
  LlmMessage,
  LlmProvider,
  LlmTurn,
  OpenAiToolDef,
} from '@colanode/bot/provider/llm-provider';
import { runAgentLoop } from '@colanode/bot/agent/loop';

class ScriptedProvider implements LlmProvider {
  constructor(private readonly turns: LlmTurn[]) {}
  async generateReply(): Promise<string> {
    return '';
  }
  async generateWithTools(_m: LlmMessage[], _t: OpenAiToolDef[]): Promise<LlmTurn> {
    return this.turns.shift() ?? { text: 'done', toolCalls: [] };
  }
}

const ctx = {} as ToolContext;
const pageTool: Tool = {
  name: 'colanode_create_page',
  description: 'd',
  inputSchema: { type: 'object' },
  run: async () => 'Created page pg1',
};
const dialog: ChatMessage[] = [{ role: 'user', content: 'make a page' }];

describe('runAgentLoop', () => {
  it('dispatches a tool call then returns the final text + action log', async () => {
    const provider = new ScriptedProvider([
      { text: null, toolCalls: [{ id: 'c1', name: 'colanode_create_page', argumentsJson: '{}' }] },
      { text: 'Done, created the page.', toolCalls: [] },
    ]);
    const result = await runAgentLoop({ provider, tools: [pageTool], systemPrompt: 'sys', dialog, ctx });
    expect(result.text).toBe('Done, created the page.');
    expect(result.actions).toEqual([{ name: 'colanode_create_page', ok: true, result: 'Created page pg1' }]);
  });

  it('returns text immediately when the model uses no tools', async () => {
    const provider = new ScriptedProvider([{ text: 'just chatting', toolCalls: [] }]);
    const result = await runAgentLoop({ provider, tools: [pageTool], systemPrompt: 'sys', dialog, ctx });
    expect(result.text).toBe('just chatting');
    expect(result.actions).toEqual([]);
  });

  it('stops at the tool-call budget', async () => {
    const callTurn: LlmTurn = {
      text: null,
      toolCalls: [{ id: 'c', name: 'colanode_create_page', argumentsJson: '{}' }],
    };
    const provider = new ScriptedProvider([callTurn, callTurn, callTurn]);
    const result = await runAgentLoop({ provider, tools: [pageTool], systemPrompt: 'sys', dialog, ctx, maxCalls: 2 });
    expect(result.actions).toHaveLength(2);
  });
});
