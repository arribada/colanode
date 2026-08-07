// ABOUTME: Authenticated management of a node's public share links — create a
// ABOUTME: link (password / expiry / sub-pages), list a node's links, revoke.
import { randomBytes } from 'crypto';

import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { extractNodeRole, hasNodeRole } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { generatePasswordHash } from '@colanode/server/lib/accounts';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

export const shareRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  // Create a share link for a node.
  instance.route({
    method: 'POST',
    url: '/',
    schema: {
      body: z.object({
        nodeId: z.string(),
        permission: z.enum(['read', 'suggest']).default('read'),
        includeSubpages: z.boolean().default(false),
        password: z.string().nullable().optional(),
        expiresInDays: z.number().int().positive().nullable().optional(),
      }),
    },
    handler: async (request, reply) => {
      const workspaceId = request.workspace.id;
      const userId = request.workspace.user.id;
      const { nodeId, permission, includeSubpages, password, expiresInDays } =
        request.body;

      const tree = await fetchNodeTree(nodeId);
      const treeNodes = tree.map((node) => mapNode(node));
      const target = treeNodes[treeNodes.length - 1];
      if (target === undefined || target.id !== nodeId) {
        return reply
          .code(404)
          .send({ code: 'node_not_found', message: 'Node not found.' });
      }

      // You cannot publicly share a node you cannot edit. Mirror the suggestion
      // routes: derive the caller's role from the node tree and require editor.
      const role = extractNodeRole(treeNodes, userId);
      if (!role || !hasNodeRole(role, 'editor')) {
        return reply.code(403).send({
          code: 'forbidden',
          message: 'You must be an editor of this page to share it.',
        });
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
          permission,
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
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;
      const tree = await fetchNodeTree(request.query.nodeId);
      const treeNodes = tree.map((node) => mapNode(node));
      const role = extractNodeRole(treeNodes, userId);
      if (!role || !hasNodeRole(role, 'viewer')) {
        return reply
          .code(403)
          .send({ code: 'forbidden', message: 'No access to this page.' });
      }

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
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;

      // Load the share so we can authorize the revoke: only the share's creator
      // or an editor of its node may revoke it.
      const share = await database
        .selectFrom('node_shares')
        .selectAll()
        .where('id', '=', request.params.shareId)
        .where('workspace_id', '=', request.workspace.id)
        .executeTakeFirst();

      if (!share) {
        return reply
          .code(404)
          .send({ code: 'not_found', message: 'Share not found.' });
      }

      if (share.created_by !== userId) {
        const tree = await fetchNodeTree(share.node_id);
        const treeNodes = tree.map((node) => mapNode(node));
        const role = extractNodeRole(treeNodes, userId);
        if (!role || !hasNodeRole(role, 'editor')) {
          return reply.code(403).send({
            code: 'forbidden',
            message:
              'You must be the share creator or an editor of this page to revoke it.',
          });
        }
      }

      await database
        .updateTable('node_shares')
        .set({ revoked_at: new Date() })
        .where('id', '=', request.params.shareId)
        .where('workspace_id', '=', request.workspace.id)
        .execute();

      return { success: true };
    },
  });

  // List every active share in the workspace, with page names + pending
  // suggestion counts, for the workspace-wide Shared pages view.
  instance.route({
    method: 'GET',
    url: '/all',
    handler: async (request) => {
      const userId = request.workspace.user.id;
      const shares = await database
        .selectFrom('node_shares')
        .selectAll()
        .where('workspace_id', '=', request.workspace.id)
        .where('revoked_at', 'is', null)
        .orderBy('created_at', 'desc')
        .execute();

      // This route returns share TOKENS, so it must never expose a share whose
      // node the caller has no role on. Resolve each distinct node's tree once
      // (deduped) and keep only shares on nodes the caller can see.
      const visibleNodeIds = new Set<string>();
      for (const nodeId of new Set(shares.map((s) => s.node_id))) {
        const tree = await fetchNodeTree(nodeId);
        const treeNodes = tree.map((node) => mapNode(node));
        if (extractNodeRole(treeNodes, userId) !== null) {
          visibleNodeIds.add(nodeId);
        }
      }
      const visibleShares = shares.filter((s) => visibleNodeIds.has(s.node_id));

      const nodeIds = visibleShares.map((s) => s.node_id);
      const nodes =
        nodeIds.length > 0
          ? await database
              .selectFrom('nodes')
              .select(['id', 'attributes'])
              .where('id', 'in', nodeIds)
              .execute()
          : [];
      const nameById = new Map(
        nodes.map((n) => [
          n.id,
          ((n.attributes as { name?: string }).name ?? 'Untitled') as string,
        ])
      );

      const counts =
        nodeIds.length > 0
          ? await database
              .selectFrom('share_suggestions')
              .select((eb) => ['node_id', eb.fn.count('id').as('c')])
              .where('workspace_id', '=', request.workspace.id)
              .where('status', '=', 'pending')
              .where('node_id', 'in', nodeIds)
              .groupBy('node_id')
              .execute()
          : [];
      const countById = new Map(counts.map((c) => [c.node_id, Number(c.c)]));

      return visibleShares.map((s) => ({
        id: s.id,
        token: s.token,
        nodeId: s.node_id,
        pageName: nameById.get(s.node_id) ?? 'Untitled',
        permission: s.permission,
        hasPassword: !!s.password_hash,
        includeSubpages: s.include_subpages,
        expiresAt: s.expires_at ? new Date(s.expires_at).toISOString() : null,
        createdAt: new Date(s.created_at).toISOString(),
        pendingSuggestions: countById.get(s.node_id) ?? 0,
      }));
    },
  });

  // List pending suggestions for a node.
  instance.route({
    method: 'GET',
    url: '/suggestions',
    schema: {
      querystring: z.object({ nodeId: z.string() }),
    },
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;
      const tree = await fetchNodeTree(request.query.nodeId);
      const treeNodes = tree.map((node) => mapNode(node));
      const role = extractNodeRole(treeNodes, userId);
      if (!role || !hasNodeRole(role, 'editor')) {
        return reply.code(403).send({
          code: 'forbidden',
          message:
            'You must be an editor of this page to view its suggestions.',
        });
      }

      const rows = await database
        .selectFrom('share_suggestions')
        .selectAll()
        .where('node_id', '=', request.query.nodeId)
        .where('workspace_id', '=', request.workspace.id)
        .where('status', '=', 'pending')
        .orderBy('created_at', 'desc')
        .execute();

      return rows.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        proposedHtml: r.proposed_html,
        proposedText: r.proposed_text,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    },
  });

  // Approve or reject a suggestion.
  instance.route({
    method: 'PATCH',
    url: '/suggestions/:suggestionId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        suggestionId: z.string(),
      }),
      body: z.object({ status: z.enum(['approved', 'rejected']) }),
    },
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;

      const suggestion = await database
        .selectFrom('share_suggestions')
        .selectAll()
        .where('id', '=', request.params.suggestionId)
        .where('workspace_id', '=', request.workspace.id)
        .executeTakeFirst();

      if (!suggestion) {
        return reply
          .code(404)
          .send({ code: 'not_found', message: 'Suggestion not found.' });
      }

      const tree = await fetchNodeTree(suggestion.node_id);
      const treeNodes = tree.map((node) => mapNode(node));
      const role = extractNodeRole(treeNodes, userId);
      if (!role || !hasNodeRole(role, 'editor')) {
        return reply.code(403).send({
          code: 'forbidden',
          message: 'You must be an editor of this page to review suggestions.',
        });
      }

      await database
        .updateTable('share_suggestions')
        .set({ status: request.body.status })
        .where('id', '=', request.params.suggestionId)
        .where('workspace_id', '=', request.workspace.id)
        .execute();
      return { success: true };
    },
  });

  done();
};
