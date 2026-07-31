export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ToolCall = { id: string; name: string; argumentsJson: string };

export type OpenAiToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export type LlmTurn = { text: string | null; toolCalls: ToolCall[] };

export interface LlmProvider {
  generateReply(messages: ChatMessage[], system: string): Promise<string>;
  generateWithTools(
    messages: LlmMessage[],
    tools: OpenAiToolDef[]
  ): Promise<LlmTurn>;
}

export const buildToolChatRequest = (
  model: string,
  messages: LlmMessage[],
  tools: OpenAiToolDef[]
): {
  model: string;
  tools: OpenAiToolDef[];
  messages: Record<string, unknown>[];
} => ({
  model,
  tools,
  messages: messages.map((m) => {
    if (m.role === 'assistant') {
      const calls = m.toolCalls ?? [];
      return calls.length > 0
        ? {
            role: 'assistant',
            content: m.content,
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: c.argumentsJson },
            })),
          }
        : { role: 'assistant', content: m.content };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  }),
});

export const parseAssistantTurn = (json: unknown): LlmTurn => {
  const message = (
    json as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
    }
  ).choices?.[0]?.message;
  const toolCalls = (message?.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function.name,
    argumentsJson: c.function.arguments,
  }));
  return { text: message?.content ?? null, toolCalls };
};

export const buildChatRequest = (
  model: string,
  system: string,
  messages: ChatMessage[]
): { model: string; messages: { role: string; content: string }[] } => ({
  model,
  messages: [{ role: 'system', content: system }, ...messages],
});

export type OpenAiCompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly options: OpenAiCompatibleOptions;

  constructor(options: OpenAiCompatibleOptions) {
    this.options = options;
  }

  async generateReply(
    messages: ChatMessage[],
    system: string
  ): Promise<string> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(
        buildChatRequest(this.options.model, system, messages)
      ),
    });
    if (!response.ok) {
      throw new Error(
        `LLM request failed: HTTP ${response.status} ${response.statusText}`
      );
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned an empty response');
    }
    return content;
  }

  async generateWithTools(
    messages: LlmMessage[],
    tools: OpenAiToolDef[]
  ): Promise<LlmTurn> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(
        buildToolChatRequest(this.options.model, messages, tools)
      ),
    });
    if (!response.ok) {
      throw new Error(
        `LLM request failed: HTTP ${response.status} ${response.statusText}`
      );
    }
    return parseAssistantTurn(await response.json());
  }
}
