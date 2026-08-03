// The in-editor "MCP-like" wiki agent + the docked conversational chat. Both
// run an Anthropic tool-use loop (via the `ai` package's generateText) over the
// reusable wiki tool layer (lib/ai/tools.ts). Each tool's execute runs with the
// acting user's permissions and records a WikiAction; the collected actions are
// returned alongside the model's final summary text.
//
//   - runWikiAgent: a single instruction (+ optional page/selection/context).
//   - runWikiChat:  a multi-turn transcript; only the latest user turn runs
//                   fresh tools (prior turns are replayed as plain text).
import { generateText, ModelMessage, stepCountIs, tool, ToolSet } from 'ai';

import { AiAgentAction, AiAgentInput, AiChatInput } from '@colanode/core';

import { ResolvedLlm, resolveAiModel } from '@colanode/server/lib/ai/llms';
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

// The chat endpoint layers a conversational framing on top of the shared base.
const CHAT_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  '\n\nYou are a conversational assistant docked inside the Arribada Wiki. ' +
  'Continue the conversation; when the user asks you to change the wiki, DO ' +
  'it by calling tools, then briefly say what you did. If the user is viewing ' +
  'a page (a pageId is provided) or has a selection, treat that as the ' +
  'current context. Earlier turns are provided only as plain conversation ' +
  'history — act on the latest user turn.';

const MAX_STEPS = 6;
const MAX_OUTPUT_TOKENS = 4096;

// Builds the `ai` ToolSet from the wiki tool manifest, bound to `ctx`. Every
// tool's execute records the WikiAction it performed into `actions` (shared by
// reference with the caller) and returns recoverable errors as a tool result so
// the model can adapt instead of the whole run aborting.
const buildWikiTools = (
  ctx: WikiToolContext,
  actions: AiAgentAction[]
): ToolSet => {
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
  return tools;
};

// Builds the leading "what the user is looking at" note from the optional
// page/selection/context, or '' when there is none.
const buildContextNote = (input: {
  pageId?: string;
  selection?: string;
  context?: string;
}): string => {
  const parts: string[] = [];
  if (input.pageId) {
    parts.push(
      `The user is currently viewing the page with node id: ${input.pageId}. ` +
        'When they say "this page" or ask to edit/append without naming a ' +
        'page, operate on that id.'
    );
  }
  if (input.selection) {
    parts.push(
      `The user has selected the following text:\n"""\n${input.selection}\n"""`
    );
  }
  if (input.context) {
    parts.push(`Additional context:\n"""\n${input.context}\n"""`);
  }
  return parts.join('\n\n');
};

const RETRY_ATTEMPTS = 3;

// Free / OpenAI-compatible models (e.g. Groq llama) intermittently fail the
// tool-calling loop, which surfaced as a hard 500 ("the AI agent failed")
// roughly half the time. Retry the tool run while NOTHING has executed yet (a
// pure tool-call parse failure is safe to retry), and if it still won't produce
// an answer, fall back to a plain no-tools completion so the user always gets a
// response. Never retry once a tool has executed this attempt — that could
// re-apply a create/edit and double-write the wiki.
const generateAgentAnswer = async (
  llm: ResolvedLlm,
  base: { system: string; prompt?: string; messages?: ModelMessage[] },
  tools: ToolSet,
  actions: AiAgentAction[]
): Promise<string> => {
  const call = (withTools: boolean) =>
    generateText({
      model: resolveAiModel(llm),
      system: base.system,
      ...(base.messages
        ? { messages: base.messages }
        : { prompt: base.prompt ?? '' }),
      ...(withTools ? { tools, stopWhen: stepCountIs(MAX_STEPS) } : {}),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const { text } = await call(true);
      if (text && text.trim().length > 0) {
        return text;
      }
      if (actions.length > 0) {
        // Tools ran but the model returned no summary; don't re-run (writes).
        return 'Done.';
      }
      // Empty answer and nothing ran yet: safe to retry.
    } catch {
      if (actions.length > 0) {
        // A tool already executed this attempt — stop, don't re-apply writes.
        break;
      }
      // Nothing ran: safe to retry.
    }
  }

  // Fallback: plain completion, no tools — always returns an answer.
  const { text } = await call(false);
  return text;
};

export const runWikiAgent = async (
  llm: ResolvedLlm,
  ctx: WikiToolContext,
  input: AiAgentInput
): Promise<{ text: string; actions: AiAgentAction[] }> => {
  const actions: AiAgentAction[] = [];
  const tools = buildWikiTools(ctx, actions);

  const contextNote = buildContextNote(input);
  const prompt = [contextNote, input.message]
    .filter((part) => part.length > 0)
    .join('\n\n');

  const text = await generateAgentAnswer(
    llm,
    { system: SYSTEM_PROMPT, prompt },
    tools,
    actions
  );

  return { text, actions };
};

// Multi-turn variant used by POST …/ai/chat. The running transcript is mapped
// to the SDK's ModelMessage[]; prior assistant turns are passed as plain text
// (no tool-call state is replayed), so only the current turn runs fresh tools.
export const runWikiChat = async (
  llm: ResolvedLlm,
  ctx: WikiToolContext,
  input: AiChatInput
): Promise<{ text: string; actions: AiAgentAction[] }> => {
  const actions: AiAgentAction[] = [];
  const tools = buildWikiTools(ctx, actions);

  const contextNote = buildContextNote(input);
  const system =
    contextNote.length > 0
      ? `${CHAT_SYSTEM_PROMPT}\n\nCurrent context:\n${contextNote}`
      : CHAT_SYSTEM_PROMPT;

  const messages: ModelMessage[] = input.messages.map((message) =>
    message.role === 'assistant'
      ? { role: 'assistant' as const, content: message.content }
      : { role: 'user' as const, content: message.content }
  );

  const text = await generateAgentAnswer(
    llm,
    { system, messages },
    tools,
    actions
  );

  return { text, actions };
};
