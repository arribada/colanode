// Remote MCP server endpoint (Streamable HTTP). Authenticated by a per-user MCP
// access token (Authorization: Bearer <token>) rather than the normal
// account/workspace session, so an external MCP client (e.g. Claude Desktop)
// can connect with just a static token. It runs statelessly: a fresh MCP
// Server + transport is created per request and bridged onto Fastify's raw
// Node req/res (reply.hijack() hands the response to the transport). The token
// resolves the acting {userId, workspaceId} used to build the wiki tool
// context, so every tool call is scoped and permission-checked as that user.
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import { database } from '@colanode/server/data/database';
import { createLogger } from '@colanode/server/lib/logger';
import { createWikiMcpServer } from '@colanode/server/lib/mcp/wiki-mcp-server';

const logger = createLogger('api:client:mcp');

const extractBearer = (request: FastifyRequest): string | null => {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};

export const mcpRoutes: FastifyPluginCallback = (instance, _, done) => {
  const handle = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearer(request);
    if (!token) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Bearer')
        .send({ error: 'Missing or malformed Authorization bearer token.' });
    }

    const tokenRow = await database
      .selectFrom('mcp_access_tokens')
      .select(['id', 'user_id', 'workspace_id'])
      .where('token', '=', token)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    if (!tokenRow) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Bearer')
        .send({ error: 'Invalid or revoked MCP access token.' });
    }

    // Best-effort last-used bookkeeping; never blocks or fails the request.
    void database
      .updateTable('mcp_access_tokens')
      .set({ last_used_at: new Date() })
      .where('id', '=', tokenRow.id)
      .execute()
      .catch((error) => {
        logger.warn({ err: error }, 'Failed to update MCP token last_used_at');
      });

    const server = createWikiMcpServer({
      userId: tokenRow.user_id,
      workspaceId: tokenRow.workspace_id,
    });

    // Stateless mode: no session id, a fresh transport per request.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    // Hand the raw Node req/res to the transport. reply.hijack() tells Fastify
    // to stop managing this response so the transport can own the stream; the
    // pre-parsed JSON body is passed through so the transport does not re-read
    // the (already consumed) request stream.
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      logger.error({ err: error }, 'MCP request handling failed');
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.end();
      }
    }
    return reply;
  };

  instance.route({ method: 'POST', url: '/mcp', handler: handle });
  instance.route({ method: 'GET', url: '/mcp', handler: handle });
  instance.route({ method: 'DELETE', url: '/mcp', handler: handle });

  done();
};
