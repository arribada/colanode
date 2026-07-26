import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { apiErrorOutputSchema, mcpTokensListOutputSchema } from '@colanode/core';
import { database } from '@colanode/server/data/database';

// GET /client/v1/workspaces/:workspaceId/ai/mcp/tokens
//
// Lists the requesting user's active (non-revoked) MCP tokens for this
// workspace. The raw token value is NEVER returned — only id, name and
// created/last-used timestamps.
export const mcpTokensListRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/mcp/tokens',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: {
        200: mcpTokensListOutputSchema,
        400: apiErrorOutputSchema,
      },
    },
    handler: async (request) => {
      const userId = request.workspace.user.id;
      const workspaceId = request.workspace.id;

      const rows = await database
        .selectFrom('mcp_access_tokens')
        .select(['id', 'name', 'created_at', 'last_used_at'])
        .where('user_id', '=', userId)
        .where('workspace_id', '=', workspaceId)
        .where('revoked_at', 'is', null)
        .orderBy('created_at', 'desc')
        .execute();

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at.toISOString(),
        lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      }));
    },
  });

  done();
};
