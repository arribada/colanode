import { randomBytes } from 'node:crypto';

import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  apiErrorOutputSchema,
  generateId,
  IdType,
  mcpTokenCreateInputSchema,
  mcpTokenCreateOutputSchema,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';

// POST /client/v1/workspaces/:workspaceId/ai/mcp/tokens
//
// Mints a new MCP access token for the requesting user in this workspace. The
// raw token is returned ONCE, here — it is never retrievable again (only its
// metadata is later listable). Used to connect an external MCP client such as
// Claude Desktop to the remote MCP server endpoint.
export const mcpTokensCreateRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/mcp/tokens',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: mcpTokenCreateInputSchema,
      response: {
        200: mcpTokenCreateOutputSchema,
        400: apiErrorOutputSchema,
      },
    },
    handler: async (request) => {
      const userId = request.workspace.user.id;
      const workspaceId = request.workspace.id;

      const trimmed = request.body.name?.trim();
      const name = trimmed && trimmed.length > 0 ? trimmed : null;
      const token = `mcp_${randomBytes(24).toString('hex')}`;
      const id = generateId(IdType.McpToken);
      const now = new Date();

      await database
        .insertInto('mcp_access_tokens')
        .values({
          id,
          token,
          user_id: userId,
          workspace_id: workspaceId,
          name,
          created_at: now,
          last_used_at: null,
          revoked_at: null,
        })
        .execute();

      return {
        id,
        token,
        name,
        createdAt: now.toISOString(),
      };
    },
  });

  done();
};
