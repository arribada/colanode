// Builds a low-level MCP Server bound to a single acting user + workspace,
// exposing the shared wiki tool layer (wikiToolDefinitions). Each tool call
// runs through the very same run() the agentic /ai/agent endpoint uses, so it
// inherits the workspace-membership + node-access checks. Consumed by the
// remote MCP HTTP endpoint (see api/client/routes/mcp).
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';

import {
  WikiToolContext,
  WikiToolDefinition,
  WikiToolError,
  wikiToolDefinitions,
} from '@colanode/server/lib/ai/tools';

const toolsByName = new Map<string, WikiToolDefinition>(
  wikiToolDefinitions.map((def): [string, WikiToolDefinition] => [
    def.name,
    def,
  ])
);

// Creates a fresh MCP Server for one authenticated {userId, workspaceId}. The
// wiki tools are registered on it; the caller wires it to a transport.
export const createWikiMcpServer = (ctx: WikiToolContext): Server => {
  const server = new Server(
    { name: 'arribada-wiki', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Tools to search, read and edit the Arribada Wiki (a Colanode ' +
        'workspace). Every action runs as your own wiki user and respects ' +
        'your workspace permissions.',
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: wikiToolDefinitions.map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: z.toJSONSchema(def.inputSchema) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const def = toolsByName.get(request.params.name);
    if (!def) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Unknown tool: ${request.params.name}` },
        ],
      };
    }

    try {
      const result = await def.run(ctx, request.params.arguments ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      // WikiToolError is an expected, recoverable failure (permission denied,
      // not found, bad input) — surface its message to the model. Anything
      // else is unexpected; keep the detail server-side.
      const message =
        error instanceof WikiToolError
          ? error.message
          : 'The tool failed to execute.';
      return {
        isError: true,
        content: [{ type: 'text', text: message }],
      };
    }
  });

  return server;
};
