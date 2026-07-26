import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { apiErrorOutputSchema, mcpTokenRevokeOutputSchema } from '@colanode/core';
import { database } from '@colanode/server/data/database';

// DELETE /client/v1/workspaces/:workspaceId/ai/mcp/tokens/:id
//
// Revokes one of the requesting user's MCP tokens (soft-delete via revoked_at).
// Scoped to the caller's user + workspace so a token can only be revoked by its
// owner. Idempotent: revoking an already-revoked/unknown id returns revoked:false.
export const mcpTokensRevokeRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'DELETE',
    url: '/mcp/tokens/:id',
    schema: {
      params: z.object({ workspaceId: z.string(), id: z.string() }),
      response: {
        200: mcpTokenRevokeOutputSchema,
        400: apiErrorOutputSchema,
      },
    },
    handler: async (request) => {
      const userId = request.workspace.user.id;
      const workspaceId = request.workspace.id;
      const { id } = request.params;

      const result = await database
        .updateTable('mcp_access_tokens')
        .set({ revoked_at: new Date() })
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .where('workspace_id', '=', workspaceId)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();

      return {
        id,
        revoked: (result.numUpdatedRows ?? 0n) > 0n,
      };
    },
  });

  done();
};
