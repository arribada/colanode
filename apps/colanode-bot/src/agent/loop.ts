import { Tool, ToolContext } from '@colanode/agent-tools';
import {
  dispatchToolCall,
  ToolOutcome,
  toolsToOpenAi,
} from '@colanode/bot/agent/tool-adapter';
import {
  ChatMessage,
  LlmMessage,
  LlmProvider,
} from '@colanode/bot/provider/llm-provider';

export type AgentResult = { text: string; actions: ToolOutcome[] };

export const runAgentLoop = async (params: {
  provider: LlmProvider;
  tools: Tool[];
  systemPrompt: string;
  dialog: ChatMessage[];
  ctx: ToolContext;
  maxRounds?: number;
  maxCalls?: number;
}): Promise<AgentResult> => {
  const { provider, tools, systemPrompt, dialog, ctx } = params;
  const maxRounds = params.maxRounds ?? 5;
  const maxCalls = params.maxCalls ?? 8;
  const openAiTools = toolsToOpenAi(tools);
  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...dialog.map((m): LlmMessage => ({ role: m.role, content: m.content })),
  ];
  const actions: ToolOutcome[] = [];
  let lastText = '';

  for (let round = 0; round < maxRounds; round++) {
    const turn = await provider.generateWithTools(messages, openAiTools);
    if (turn.text) {
      lastText = turn.text;
    }
    if (turn.toolCalls.length === 0) {
      return { text: turn.text ?? lastText, actions };
    }
    const budgetLeft = Math.max(0, maxCalls - actions.length);
    const calls = turn.toolCalls.slice(0, budgetLeft);
    messages.push({ role: 'assistant', content: turn.text ?? null, toolCalls: calls });
    for (const call of calls) {
      const outcome = await dispatchToolCall(call, tools, ctx);
      actions.push(outcome);
      messages.push({ role: 'tool', toolCallId: call.id, content: outcome.result });
    }
    if (actions.length >= maxCalls) {
      return { text: lastText || 'Reached the action limit; stopping.', actions };
    }
  }
  return { text: lastText || 'Reached the round limit; stopping.', actions };
};
