// ABOUTME: Authenticated management of a node's public share links — create a
// ABOUTME: link (password / expiry / sub-pages), list a node's links, revoke.
import { randomBytes } from 'crypto';

import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { database } from '@colanode/server/data/database';
import { generatePasswordHash } from '@colanode/server/lib/accounts';

export const shareRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  // Create a share link for a node.
  instance.route({
    method: 'POST',
    url: '/',
    schema: {
      body: z.object({
        nodeId: z.string(),
        includeSubpages: z.boolean().default(false),
        password: z.string().nullable().optional(),
        expiresInDays: z.number().int().positive().nullable().optional(),
      }),
    },
    handler: async (request, reply) => {
      const workspaceId = request.workspace.id;
      const { nodeId, includeSubpages, password, expiresInDays } = request.body;

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

      const id = randomBytes(15).toString('hex');
      const token = randomBytes(24).toString('base64url');
      const passwordHash =
        password && password.length > 0
          ? await generatePasswordHash(password)
          : null;
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000)
        : null;

      await database
        .insertInto('node_shares')
        .values({
          id,
          token,
          node_id: nodeId,
          workspace_id: workspaceId,
          permission: 'read',
          include_subpages: includeSubpages,
          password_hash: passwordHash,
          expires_at: expiresAt,
          revoked_at: null,
          created_at: new Date(),
          created_by: request.workspace.user.id,
        })
        .execute();

      return { id, token };
    },
  });

  // List the active share links for a node.
  instance.route({
    method: 'GET',
    url: '/',
    schema: {
      querystring: z.object({ nodeId: z.string() }),
    },
    handler: async (request) => {
      const rows = await database
        .selectFrom('node_shares')
        .selectAll()
        .where('node_id', '=', request.query.nodeId)
        .where('workspace_id', '=', request.workspace.id)
        .where('revoked_at', 'is', null)
        .execute();

      return rows.map((r) => ({
        id: r.id,
        token: r.token,
        includeSubpages: r.include_subpages,
        hasPassword: !!r.password_hash,
        expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    },
  });

  // Revoke a share link.
  instance.route({
    method: 'DELETE',
    url: '/:shareId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        shareId: z.string(),
      }),
    },
    handler: async (request) => {
      await database
        .updateTable('node_shares')
        .set({ revoked_at: new Date() })
        .where('id', '=', request.params.shareId)
        .where('workspace_id', '=', request.workspace.id)
        .execute();

      return { success: true };
    },
  });

  done();
};
