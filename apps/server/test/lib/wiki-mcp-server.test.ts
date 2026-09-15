import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';

import { WikiToolError } from '@colanode/server/lib/ai/tools';
import {
  createWikiMcpServer,
  toolErrorMessage,
} from '@colanode/server/lib/mcp/wiki-mcp-server';

describe('wiki MCP server errors', () => {
  it('names what a call got wrong instead of a generic failure', async () => {
    // The input is refused before anything is looked up, so no user or
    // workspace needs to exist.
    const server = createWikiMcpServer({
      userId: 'nobody',
      workspaceId: 'nowhere',
    });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: 'edit_page',
        arguments: { id: 'x', content: 'text', mode: 'rewrite' },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as { type: string; text: string }[])[0]!
        .text;
      expect(text).toMatch(/^Invalid input/);
      expect(text).toMatch(/mode/);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('passes on what a tool says, and keeps anything else server-side', () => {
    expect(toolErrorMessage(new WikiToolError('Node x was not found.'))).toBe(
      'Node x was not found.'
    );
    expect(
      toolErrorMessage(new Error('connect ECONNREFUSED 10.0.0.3:5432'))
    ).toBe('The tool failed to execute.');

    const invalid = z.object({ id: z.string() }).safeParse({});
    expect(toolErrorMessage(invalid.error)).toMatch(/^Invalid input.*id/s);
  });
});
