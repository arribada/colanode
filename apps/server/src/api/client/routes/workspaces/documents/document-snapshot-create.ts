import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  DocumentSnapshotOutput,
  apiErrorOutputSchema,
  documentSnapshotCreateInputSchema,
  documentSnapshotOutputSchema,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import {
  DEFAULT_DOCUMENT_SNAPSHOT_RETENTION,
  captureDocumentSnapshot,
  pruneDocumentSnapshots,
} from '@colanode/server/lib/document-snapshots';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

// Cuts a snapshot of the document as it stands right now. The merge job writes
// snapshots on its own schedule, which is fine for "what did this look like
// last week" but useless for "this is the version we agreed on": that moment
// has to be recorded when it happens, with the tag and the changelog.
export const documentSnapshotCreateRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/:documentId/snapshots',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        documentId: z.string(),
      }),
      body: documentSnapshotCreateInputSchema,
      response: {
        200: documentSnapshotOutputSchema,
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

      // Cutting a version is an edit to the record of the page, so it takes
      // the same role as editing it.
      const role = extractNodeRole(nodes, request.workspace.user.id);
      if (role === null || !hasNodeRole(role, 'editor')) {
        return reply.code(403).send({
          code: ApiErrorCode.DocumentNoAccess,
          message: 'You do not have access to this document.',
        });
      }

      const snapshot = await captureDocumentSnapshot(
        documentId,
        { name: request.body.name ?? null, note: request.body.note ?? null },
        request.workspace.user.id
      );

      if (!snapshot) {
        return reply.code(404).send({
          code: ApiErrorCode.DocumentNotFound,
          message: 'This page has no content to capture yet.',
        });
      }

      await pruneDocumentSnapshots(
        documentId,
        DEFAULT_DOCUMENT_SNAPSHOT_RETENTION
      );

      const output: DocumentSnapshotOutput = {
        id: snapshot.id,
        documentId: snapshot.document_id,
        revision: snapshot.revision,
        createdAt: snapshot.created_at.toISOString(),
        createdBy: snapshot.created_by,
        name: snapshot.name,
        note: snapshot.note,
        content: snapshot.content,
      };

      return output;
    },
  });

  done();
};
