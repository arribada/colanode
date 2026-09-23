import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  DocumentContent,
  DocumentUpdateContentOutput,
  apiErrorOutputSchema,
  documentUpdateContentOutputSchema,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

// The document as it stood right after one recorded edit: every update up to
// and including it, folded in order. This is the same reconstruction the
// client does for its own updates, so a preview here matches what restoring
// to that point would write.
export const documentUpdateGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:documentId/updates/:updateId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        documentId: z.string(),
        updateId: z.string(),
      }),
      response: {
        200: documentUpdateContentOutputSchema,
        403: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const { documentId, updateId } = request.params;

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
        .selectAll()
        .where('document_id', '=', documentId)
        .where('workspace_id', '=', request.workspace.id)
        .orderBy('revision', 'asc')
        .execute();

      const ydoc = new YDoc();
      let target = null;
      for (const update of updates) {
        ydoc.applyUpdate(update.data);
        if (update.id === updateId) {
          target = update;
          break;
        }
      }

      if (!target) {
        return reply.code(404).send({
          code: ApiErrorCode.DocumentNotFound,
          message: 'This edit is no longer kept.',
        });
      }

      const output: DocumentUpdateContentOutput = {
        id: target.id,
        documentId: target.document_id,
        revision: target.revision,
        createdAt: target.created_at.toISOString(),
        createdBy: target.created_by,
        mergedCount: (target.merged_updates?.length ?? 0) + 1,
        content: ydoc.getObject<DocumentContent>(),
      };

      return output;
    },
  });

  done();
};
