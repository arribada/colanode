import { Tool, ToolContext } from '@colanode/agent-tools';
import { OpenAiToolDef, ToolCall } from '@colanode/bot/provider/llm-provider';

export type ToolOutcome = { name: string; ok: boolean; result: string };

export const toolsToOpenAi = (tools: Tool[]): OpenAiToolDef[] =>
  tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));

export const dispatchToolCall = async (
  call: ToolCall,
  tools: Tool[],
  ctx: ToolContext
): Promise<ToolOutcome> => {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return { name: call.name, ok: false, result: `Unknown tool: ${call.name}` };
  }
  let args: Record<string, unknown>;
  try {
    const raw = call.argumentsJson.trim();
    args = raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return { name: call.name, ok: false, result: `Invalid JSON arguments for ${call.name}` };
  }
  try {
    const result = await tool.run(args, ctx);
    return { name: call.name, ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name: call.name, ok: false, result: message };
  }
};
