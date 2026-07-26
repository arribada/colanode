// The in-editor "MCP-like" wiki agent. Runs an Anthropic tool-use loop (via
// the `ai` package's generateText) over the reusable wiki tool layer
// (lib/ai/tools.ts). Each tool's execute runs with the acting user's
// permissions and records a WikiAction; the collected actions are returned
// alongside the model's final summary text.
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool, ToolSet } from 'ai';

import { AiAgentAction, AiAgentInput } from '@colanode/core';

import { ResolvedLlm } from '@colanode/server/lib/ai/llms';
import {
  WikiToolContext,
  wikiToolDefinitions,
} from '@colanode/server/lib/ai/tools';

const SYSTEM_PROMPT =
  'You are the Arribada Wiki AI, an assistant embedded in a collaborative ' +
  'wiki (Colanode). You can read, search, create and edit wiki pages and ' +
  'databases by CALLING the provided tools — never claim to have made a ' +
  'change without calling the matching tool. When the user has selected text ' +
  'or is on a page (a pageId is provided), operate in that context: treat ' +
  '"this page" as that page id. Prefer reading a page (get_page) or searching ' +
  '(search_pages) before editing so your edits are grounded. Page and record ' +
  'content is markdown. After you have made the requested change, reply with ' +
  'a short, plain summary of exactly what you did (names and where), or answer ' +
  'the question if no change was required. Keep answers concise.';

const MAX_STEPS = 6;

export const runWikiAgent = async (
  llm: ResolvedLlm,
  ctx: WikiToolContext,
  input: AiAgentInput
): Promise<{ text: string; actions: AiAgentAction[] }> => {
  const actions: AiAgentAction[] = [];
  const anthropic = createAnthropic({ apiKey: llm.apiKey });

  const tools: ToolSet = {};
  for (const definition of wikiToolDefinitions) {
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: async (rawInput) => {
        try {
          const result = await definition.run(ctx, rawInput);
          const action = definition.action(rawInput, result);
          if (action) {
            actions.push(action);
          }
          return result;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return { error: message };
        }
      },
    });
  }

  const contextParts: string[] = [];
  if (input.pageId) {
    contextParts.push(
      `The user is currently viewing the page with node id: ${input.pageId}. ` +
        'When they say "this page" or ask to edit/append without naming a ' +
        'page, operate on that id.'
    );
  }
  if (input.selection) {
    contextParts.push(
      `The user has selected the following text:\n"""\n${input.selection}\n"""`
    );
  }
  if (input.context) {
    contextParts.push(`Additional context:\n"""\n${input.context}\n"""`);
  }

  const prompt = [contextParts.join('\n\n'), input.message]
    .filter((part) => part.length > 0)
    .join('\n\n');

  const { text } = await generateText({
    model: anthropic(llm.model),
    system: SYSTEM_PROMPT,
    prompt,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 4096,
  });

  return { text, actions };
};
