import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  apiErrorOutputSchema,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import { fetchDocumentStates } from '@colanode/server/lib/document-bootstrap';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

// The first sync of a space, as states instead of history. Same access rule
// as the stream this replaces: a role on the space means every document in
// it, which is exactly what the per-space synchronizer already sends.

const MAX_DOCUMENTS = 25;
const MAX_BYTES = 4 * 1024 * 1024;

const mergedUpdatesSchema = z
  .array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      createdBy: z.string(),
    })
  )
  .nullish();

export const nodeDocumentsGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:nodeId/documents',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        nodeId: z.string(),
      }),
      querystring: z.object({
        after: z.string().optional(),
      }),
      response: {
        200: z.object({
          revision: z.string(),
          items: z.array(
            z.object({
              id: z.string(),
              documentId: z.string(),
              revision: z.string(),
              data: z.string(),
              createdAt: z.string(),
              createdBy: z.string(),
              mergedUpdates: mergedUpdatesSchema,
            })
          ),
          next: z.string().nullable(),
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

      // Only a space: the answer covers everything whose root is this node,
      // so asking from halfway down the tree would hand over more than the
      // node asked about.
      if (leaf.root_id !== nodeId) {
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

      return fetchDocumentStates({
        rootId: nodeId,
        after: request.query.after ?? null,
        maxDocuments: MAX_DOCUMENTS,
        maxBytes: MAX_BYTES,
      });
    },
  });

  done();
};
