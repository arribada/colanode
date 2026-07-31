import { describe, expect, it } from 'vitest';
import { Tool, ToolContext } from '@colanode/agent-tools';
import { dispatchToolCall, toolsToOpenAi } from '@colanode/bot/agent/tool-adapter';

const ctx = {} as ToolContext;
const echoTool: Tool = {
  name: 'colanode_create_page',
  description: 'd',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
  run: async (args) => `ran:${JSON.stringify(args)}`,
};
const throwTool: Tool = {
  name: 'colanode_update_page',
  description: 'd',
  inputSchema: { type: 'object' },
  run: async () => {
    throw new Error('boom');
  },
};

describe('toolsToOpenAi', () => {
  it('maps a Tool to an OpenAI function tool', () => {
    expect(toolsToOpenAi([echoTool])).toEqual([
      { type: 'function', function: { name: 'colanode_create_page', description: 'd', parameters: echoTool.inputSchema } },
    ]);
  });
});

describe('dispatchToolCall', () => {
  it('runs a known tool with parsed args', async () => {
    const out = await dispatchToolCall({ id: 'c1', name: 'colanode_create_page', argumentsJson: '{"name":"X"}' }, [echoTool], ctx);
    expect(out).toEqual({ name: 'colanode_create_page', ok: true, result: 'ran:{"name":"X"}' });
  });
  it('treats empty arguments as {}', async () => {
    const out = await dispatchToolCall({ id: 'c1', name: 'colanode_create_page', argumentsJson: '' }, [echoTool], ctx);
    expect(out.ok).toBe(true);
    expect(out.result).toBe('ran:{}');
  });
  it('reports unknown tools as a failed outcome', async () => {
    const out = await dispatchToolCall({ id: 'c1', name: 'nope', argumentsJson: '{}' }, [echoTool], ctx);
    expect(out).toEqual({ name: 'nope', ok: false, result: 'Unknown tool: nope' });
  });
  it('reports malformed JSON as a failed outcome', async () => {
    const out = await dispatchToolCall({ id: 'c1', name: 'colanode_create_page', argumentsJson: '{bad' }, [echoTool], ctx);
    expect(out.ok).toBe(false);
    expect(out.result).toContain('Invalid JSON');
  });
  it('captures a thrown tool error as a failed outcome', async () => {
    const out = await dispatchToolCall({ id: 'c1', name: 'colanode_update_page', argumentsJson: '{}' }, [throwTool], ctx);
    expect(out).toEqual({ name: 'colanode_update_page', ok: false, result: 'boom' });
  });
});
