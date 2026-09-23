import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  DocumentUpdateListOutput,
  apiErrorOutputSchema,
  documentUpdateListOutputSchema,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

// The fine-grained tail of a document's history, read from the server rather
// than from whatever this device happens to hold. A client that joined after
// its updates had been folded into a state has none of them locally, which is
// why the "recent edits" list used to be empty on a phone or a fresh browser.
export const documentUpdateListRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:documentId/updates',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        documentId: z.string(),
      }),
      response: {
        200: documentUpdateListOutputSchema,
        403: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const documentId = request.params.documentId;

      const tree = await fetchNodeTree(documentId);
      if (tree.length === 0) {
        return reply.code(404).send({
          code: ApiErrorCode.DocumentNotFound,
          message: 'Document not found.',
        });
      }

      const nodes = tree.map((node) => mapNode(node));
      const node = nodes[nodes.length - 1];
      if (!node || node.id !== documentId) {
        return reply.code(404).send({
          code: ApiErrorCode.DocumentNotFound,
          message: 'Document not found.',
        });
      }

      const role = extractNodeRole(nodes, request.workspace.user.id);
      if (role === null || !hasNodeRole(role, 'viewer')) {
        return reply.code(403).send({
          code: ApiErrorCode.DocumentNoAccess,
          message: 'You do not have access to this document.',
        });
      }

      const updates = await database
        .selectFrom('document_updates')
        .select([
          'id',
          'document_id',
          'revision',
          'created_at',
          'created_by',
          'merged_updates',
        ])
        .where('document_id', '=', documentId)
        .where('workspace_id', '=', request.workspace.id)
        .orderBy('revision', 'asc')
        .execute();

      const output: DocumentUpdateListOutput = updates.map((update) => ({
        id: update.id,
        documentId: update.document_id,
        revision: update.revision,
        createdAt: update.created_at.toISOString(),
        createdBy: update.created_by,
        mergedCount: (update.merged_updates?.length ?? 0) + 1,
      }));

      return output;
    },
  });

  done();
};
