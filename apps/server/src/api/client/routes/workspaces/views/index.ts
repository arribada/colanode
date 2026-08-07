// ABOUTME: Authenticated historical page-view tracking — record that the current
// ABOUTME: user viewed a node, and list every user who has ever viewed it.
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod/v4';

import { extractNodeRole, hasNodeRole } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

export const viewRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  // Record that the current user viewed a node. UPSERT on (user_id, node_id):
  // the first view inserts the row (first=last=now, count=1); every later view
  // bumps last_viewed_at to now and increments view_count.
  instance.route({
    method: 'POST',
    url: '/:nodeId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        nodeId: z.string(),
      }),
    },
    handler: async (request, reply) => {
      const workspaceId = request.workspace.id;
      const userId = request.workspace.user.id;
      const { nodeId } = request.params;

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

      const now = new Date();
      await database
        .insertInto('node_views')
        .values({
          user_id: userId,
          node_id: nodeId,
          workspace_id: workspaceId,
          first_viewed_at: now,
          last_viewed_at: now,
          view_count: 1,
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'node_id']).doUpdateSet({
            last_viewed_at: now,
            view_count: sql<number>`node_views.view_count + 1`,
          })
        )
        .execute();

      return { success: true };
    },
  });

  // List everyone who has ever viewed this node, most-recent viewer first. The
  // client resolves each userId to a name/avatar from its own users collection,
  // so no user join happens here (mirrors the favorites list route). Rows are
  // scoped to the caller's workspace, so a node in another workspace yields [].
  instance.route({
    method: 'GET',
    url: '/:nodeId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        nodeId: z.string(),
      }),
    },
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;
      const tree = await fetchNodeTree(request.params.nodeId);
      const treeNodes = tree.map((node) => mapNode(node));
      const role = extractNodeRole(treeNodes, userId);
      if (!role || !hasNodeRole(role, 'viewer')) {
        return reply
          .code(403)
          .send({ code: 'forbidden', message: 'No access to this page.' });
      }

      const rows = await database
        .selectFrom('node_views')
        .select(['user_id', 'last_viewed_at', 'view_count'])
        .where('node_id', '=', request.params.nodeId)
        .where('workspace_id', '=', request.workspace.id)
        .orderBy('last_viewed_at', 'desc')
        .execute();

      return {
        views: rows.map((row) => ({
          userId: row.user_id,
          lastViewedAt: row.last_viewed_at,
          viewCount: row.view_count,
        })),
      };
    },
  });

  done();
};
