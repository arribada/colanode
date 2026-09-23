import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  apiErrorOutputSchema,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import {
  mapDocumentUpdate,
  mapNodeUpdate,
} from '@colanode/server/lib/node-sync';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

// A client only ever receives updates through the per-space streams, in
// revision order from the beginning of time. On a cold sync of a large
// workspace the page someone actually opened can be minutes away -- which is
// what a phone hits on every visit, since mobile browsers drop the local
// database between visits. This route hands that one page over directly.
//
// It is a shortcut, not a second source of truth: the rows are the ones the
// stream would send, in the same shape, so the client applies them with the
// same idempotent code and the stream re-delivering them later is a no-op.
// The sync cursors are untouched, so nothing is skipped either.

// Direct children come along so a page opens with its images, and a database
// with a first screen of records; capped so opening a big space stays small.
const MAX_CHILDREN = 200;

const mergedUpdatesSchema = z
  .array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      createdBy: z.string(),
    })
  )
  .nullish();

const updateFields = {
  id: z.string(),
  rootId: z.string(),
  workspaceId: z.string(),
  revision: z.string(),
  data: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  mergedUpdates: mergedUpdatesSchema,
};

export const nodeSyncGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:nodeId/sync',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        nodeId: z.string(),
      }),
      response: {
        200: z.object({
          nodes: z.array(z.object({ ...updateFields, nodeId: z.string() })),
          documents: z.array(
            z.object({ ...updateFields, documentId: z.string() })
          ),
        }),
        403: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const nodeId = request.params.nodeId;

      const tree = await fetchNodeTree(nodeId);
      const leaf = tree[tree.length - 1];
      if (!leaf || leaf.id !== nodeId) {
        return reply.code(404).send({
          code: ApiErrorCode.NodeNotFound,
          message: 'Node not found.',
        });
      }

      if (leaf.workspace_id !== request.workspace.id) {
        return reply.code(404).send({
          code: ApiErrorCode.NodeNotFound,
          message: 'Node not found.',
        });
      }

      const nodes = tree.map((node) => mapNode(node));
      const role = extractNodeRole(nodes, request.workspace.user.id);
      if (role === null || !hasNodeRole(role, 'viewer')) {
        return reply.code(403).send({
          code: ApiErrorCode.NodeNoAccess,
          message: 'You do not have access to this node.',
        });
      }

      const children = await database
        .selectFrom('nodes')
        .select('id')
        .where('parent_id', '=', nodeId)
        .orderBy('created_at', 'asc')
        .limit(MAX_CHILDREN)
        .execute();

      const nodeIds = [
        ...tree.map((node) => node.id),
        ...children.map((child) => child.id),
      ];

      const nodeUpdates = await database
        .selectFrom('node_updates')
        .selectAll()
        .where('node_id', 'in', nodeIds)
        .orderBy('revision', 'asc')
        .execute();

      const documentUpdates = await database
        .selectFrom('document_updates')
        .selectAll()
        .where('document_id', '=', nodeId)
        .orderBy('revision', 'asc')
        .execute();

      return {
        nodes: nodeUpdates.map(mapNodeUpdate),
        documents: documentUpdates.map(mapDocumentUpdate),
      };
    },
  });

  done();
};
