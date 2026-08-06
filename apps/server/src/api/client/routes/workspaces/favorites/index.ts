// ABOUTME: Authenticated management of the current user's favorite nodes — star
// ABOUTME: a node, unstar it, and list this user's favorites (node ids, newest first).
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { database } from '@colanode/server/data/database';

export const favoriteRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  // Star a node for the current user. Idempotent: re-starring is a no-op.
  instance.route({
    method: 'POST',
    url: '/',
    schema: {
      body: z.object({
        nodeId: z.string(),
      }),
    },
    handler: async (request, reply) => {
      const workspaceId = request.workspace.id;
      const userId = request.workspace.user.id;
      const { nodeId } = request.body;

      const node = await database
        .selectFrom('nodes')
        .select(['id', 'workspace_id'])
        .where('id', '=', nodeId)
        .executeTakeFirst();

      if (!node || node.workspace_id !== workspaceId) {
        return reply
          .code(404)
          .send({ code: 'node_not_found', message: 'Node not found.' });
      }

      await database
        .insertInto('node_favorites')
        .values({
          user_id: userId,
          node_id: nodeId,
          workspace_id: workspaceId,
          created_at: new Date(),
        })
        .onConflict((oc) => oc.columns(['user_id', 'node_id']).doNothing())
        .execute();

      return { success: true };
    },
  });

  // Unstar a node for the current user.
  instance.route({
    method: 'DELETE',
    url: '/:nodeId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        nodeId: z.string(),
      }),
    },
    handler: async (request) => {
      await database
        .deleteFrom('node_favorites')
        .where('user_id', '=', request.workspace.user.id)
        .where('node_id', '=', request.params.nodeId)
        .where('workspace_id', '=', request.workspace.id)
        .execute();

      return { success: true };
    },
  });

  // List the current user's favorites in this workspace, newest first.
  instance.route({
    method: 'GET',
    url: '/',
    handler: async (request) => {
      const rows = await database
        .selectFrom('node_favorites')
        .select('node_id')
        .where('user_id', '=', request.workspace.user.id)
        .where('workspace_id', '=', request.workspace.id)
        .orderBy('created_at', 'desc')
        .execute();

      return { nodeIds: rows.map((r) => r.node_id) };
    },
  });

  done();
};
