// ABOUTME: Authenticated review of a page's edit suggestions — create a member
// ABOUTME: block suggestion, list a node's pending suggestions, list the whole
// ABOUTME: workspace's pending ones, and resolve (accept/reject) one.
import { randomBytes } from 'crypto';

import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  extractNodeCollaborators,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';
import { createNotification } from '@colanode/server/lib/notifications';

// The proposed blocks are stored verbatim as JSONB; we validate the envelope
// ({ type:'rich_text', blocks:{...} }) but keep each block permissive — the
// canonical Block shape lives in @colanode/core and is enforced when the
// reviewer's client re-serialises the doc through richTextContentSchema.
const proposedContentSchema = z.object({
  type: z.literal('rich_text'),
  blocks: z.record(z.string(), z.unknown()),
});

export const suggestionRoutes: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  // Create a member (in-app) suggestion for a block.
  instance.route({
    method: 'POST',
    url: '/',
    schema: {
      body: z.object({
        nodeId: z.string(),
        blockId: z.string().nullable().optional(),
        scope: z.enum(['block', 'document']).default('block'),
        proposedContent: proposedContentSchema,
        previewText: z.string().max(2000).optional(),
      }),
    },
    handler: async (request, reply) => {
      const workspaceId = request.workspace.id;
      const userId = request.workspace.user.id;
      const { nodeId, blockId, scope, proposedContent, previewText } =
        request.body;

      const tree = await fetchNodeTree(nodeId);
      const treeNodes = tree.map((node) => mapNode(node));
      const target = treeNodes[treeNodes.length - 1];
      if (target === undefined || target.id !== nodeId) {
        return reply
          .code(404)
          .send({ code: 'node_not_found', message: 'Node not found.' });
      }

      // A suggester only needs to be able to see the page (viewer+); the whole
      // point is to propose without edit rights. The actual apply later goes
      // through document.update, which independently enforces edit permission.
      const role = extractNodeRole(treeNodes, userId);
      if (!role) {
        return reply
          .code(403)
          .send({ code: 'forbidden', message: 'No access to this page.' });
      }

      const author = await database
        .selectFrom('users')
        .select(['name', 'email'])
        .where('id', '=', userId)
        .where('workspace_id', '=', workspaceId)
        .executeTakeFirst();

      const id = randomBytes(15).toString('hex');
      await database
        .insertInto('document_suggestions')
        .values({
          id,
          workspace_id: workspaceId,
          node_id: nodeId,
          block_id: blockId ?? null,
          scope,
          proposed_content: proposedContent as Record<string, unknown>,
          preview_text: previewText ?? null,
          origin: 'member',
          author_id: userId,
          author_name: author?.name ?? null,
          author_email: author?.email ?? null,
          status: 'pending',
          created_at: new Date(),
          resolved_at: null,
          resolved_by: null,
        })
        .execute();

      // Notify every editor of the page (excluding the author) so it surfaces
      // in their bell. In-app only — createNotification never relays a
      // document_suggestion to Zulip/Dashboard.
      try {
        const rootId = treeNodes[0]?.id ?? nodeId;
        const recipients = new Set<string>();
        for (const node of treeNodes) {
          for (const collaboratorId of Object.keys(
            extractNodeCollaborators(node)
          )) {
            recipients.add(collaboratorId);
          }
        }
        for (const recipientId of recipients) {
          if (recipientId === userId) {
            continue;
          }
          const recipientRole = extractNodeRole(treeNodes, recipientId);
          if (!recipientRole || !hasNodeRole(recipientRole, 'editor')) {
            continue;
          }
          await createNotification({
            userId: recipientId,
            workspaceId,
            rootId,
            type: 'document_suggestion',
            sourceNodeId: nodeId,
            actorId: userId,
            preview: {
              authorName: author?.name ?? null,
              previewText: previewText ?? null,
            },
          });
        }
      } catch {
        // the suggestion is already stored; a failed notification must not fail it
      }

      return { id };
    },
  });

  // List pending suggestions for a single node (both member + external).
  instance.route({
    method: 'GET',
    url: '/',
    schema: {
      querystring: z.object({ nodeId: z.string() }),
    },
    handler: async (request) => {
      const rows = await database
        .selectFrom('document_suggestions')
        .selectAll()
        .where('node_id', '=', request.query.nodeId)
        .where('workspace_id', '=', request.workspace.id)
        .where('status', '=', 'pending')
        .orderBy('created_at', 'desc')
        .execute();

      return rows.map((r) => ({
        id: r.id,
        nodeId: r.node_id,
        blockId: r.block_id,
        scope: r.scope,
        proposedContent: r.proposed_content,
        previewText: r.preview_text,
        origin: r.origin,
        authorId: r.author_id,
        authorName: r.author_name,
        authorEmail: r.author_email,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    },
  });

  // List every pending suggestion in the workspace, with page names, for a
  // workspace-wide review inbox / badge.
  instance.route({
    method: 'GET',
    url: '/all',
    handler: async (request) => {
      const rows = await database
        .selectFrom('document_suggestions')
        .selectAll()
        .where('workspace_id', '=', request.workspace.id)
        .where('status', '=', 'pending')
        .orderBy('created_at', 'desc')
        .execute();

      const nodeIds = Array.from(new Set(rows.map((r) => r.node_id)));
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

      return {
        total: rows.length,
        suggestions: rows.map((r) => ({
          id: r.id,
          nodeId: r.node_id,
          pageName: nameById.get(r.node_id) ?? 'Untitled',
          scope: r.scope,
          origin: r.origin,
          authorName: r.author_name,
          previewText: r.preview_text,
          createdAt: new Date(r.created_at).toISOString(),
        })),
      };
    },
  });

  // Resolve (accept/reject) a suggestion. The document mutation itself (when
  // accepting) is applied client-side and re-authorised by document.update;
  // this endpoint only records the outcome and is gated on editor role so a
  // viewer cannot flip another contributor's suggestion.
  instance.route({
    method: 'PATCH',
    url: '/:suggestionId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        suggestionId: z.string(),
      }),
      body: z.object({ status: z.enum(['accepted', 'rejected']) }),
    },
    handler: async (request, reply) => {
      const workspaceId = request.workspace.id;
      const userId = request.workspace.user.id;

      const suggestion = await database
        .selectFrom('document_suggestions')
        .selectAll()
        .where('id', '=', request.params.suggestionId)
        .where('workspace_id', '=', workspaceId)
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

      // Only the first resolution wins; a concurrent accept+reject can't both
      // land because we require the row to still be pending.
      await database
        .updateTable('document_suggestions')
        .set({
          status: request.body.status,
          resolved_at: new Date(),
          resolved_by: userId,
        })
        .where('id', '=', request.params.suggestionId)
        .where('workspace_id', '=', workspaceId)
        .where('status', '=', 'pending')
        .execute();

      return { success: true };
    },
  });

  done();
};
