import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Tool, ToolContext, tools } from '@colanode/agent-tools';
import { getEngine, makeUserIdResolver } from '@colanode/mcp/bootstrap';
import { loadConfig } from '@colanode/mcp/config';
import { deleteNodeTool } from '@colanode/mcp/tools/delete-node';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const allTools: Tool[] = [...tools, deleteNodeTool];
  const server = new Server(
    { name: 'colanode', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = allTools.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Unknown tool: ${request.params.name}` },
        ],
      };
    }
    try {
      const app = await getEngine();
      const ctx: ToolContext = {
        app,
        resolveUserId: makeUserIdResolver(app, config),
      };
      const text = await tool.run(request.params.arguments ?? {}, ctx);
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });

  await server.connect(new StdioServerTransport());
};

main().catch((error) => {
  console.error('colanode-mcp failed to start:', error);
  process.exit(1);
});
