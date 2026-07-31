import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  DocumentSnapshotOutput,
  apiErrorOutputSchema,
  documentSnapshotOutputSchema,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

export const documentSnapshotGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:documentId/snapshots/:snapshotId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        documentId: z.string(),
        snapshotId: z.string(),
      }),
      response: {
        200: documentSnapshotOutputSchema,
        403: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const documentId = request.params.documentId;
      const snapshotId = request.params.snapshotId;

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

      const snapshot = await database
        .selectFrom('document_snapshots')
        .selectAll()
        .where('id', '=', snapshotId)
        .where('document_id', '=', documentId)
        .where('workspace_id', '=', request.workspace.id)
        .executeTakeFirst();

      if (!snapshot) {
        return reply.code(404).send({
          code: ApiErrorCode.DocumentSnapshotNotFound,
          message: 'Document snapshot not found.',
        });
      }

      const output: DocumentSnapshotOutput = {
        id: snapshot.id,
        documentId: snapshot.document_id,
        revision: snapshot.revision,
        createdAt: snapshot.created_at.toISOString(),
        createdBy: snapshot.created_by,
        content: snapshot.content,
      };

      return output;
    },
  });

  done();
};
