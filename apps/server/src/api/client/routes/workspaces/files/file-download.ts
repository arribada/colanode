import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  hasNodeRole,
  ApiErrorCode,
  extractNodeRole,
  FileStatus,
} from '@colanode/core';
import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { database } from '@colanode/server/data/database';
import { createLogger } from '@colanode/server/lib/logger';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';
import { storage } from '@colanode/server/lib/storage';

const logger = createLogger('api:client:workspaces:file-download');

export const fileDownloadRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:fileId',
    schema: {
      params: z.object({
        fileId: z.string(),
        workspaceId: z.string(),
      }),
    },
    handler: async (request, reply) => {
      const fileId = request.params.fileId;

      const tree = await fetchNodeTree(fileId);
      if (tree.length === 0) {
        return reply.code(400).send({
          code: ApiErrorCode.FileNotFound,
          message: 'File not found.',
        });
      }

      const nodes = tree.map((node) => mapNode(node));
      const file = nodes[nodes.length - 1]!;
      if (!file || file.id !== fileId) {
        return reply.code(400).send({
          code: ApiErrorCode.FileNotFound,
          message: 'File not found.',
        });
      }

      if (file.type !== 'file') {
        return reply.code(400).send({
          code: ApiErrorCode.FileNotFound,
          message: 'This node is not a file.',
        });
      }

      if (file.status !== FileStatus.Ready) {
        return reply.code(400).send({
          code: ApiErrorCode.FileNotReady,
          message: 'File is not ready to be downloaded.',
        });
      }

      const role = extractNodeRole(nodes, request.workspace.user.id);
      if (role === null || !hasNodeRole(role, 'viewer')) {
        return reply.code(403).send({
          code: ApiErrorCode.FileNoAccess,
          message: 'You do not have access to this file.',
        });
      }

      const upload = await database
        .selectFrom('uploads')
        .selectAll()
        .where('file_id', '=', fileId)
        .executeTakeFirst();

      if (!upload || !upload.uploaded_at) {
        return reply.code(400).send({
          code: ApiErrorCode.FileUploadNotFound,
          message: 'File upload not found.',
        });
      }

      try {
        const { stream, contentType } = await storage.download(upload.path);

        // Prefer the content type reported by the storage provider (S3/GCS/Azure
        // persist it), but fall back to the mime type recorded on the upload row.
        // The file-system storage provider does not store a content type, so
        // without this fallback file downloads would carry no Content-Type header
        // at all (breaking direct-URL previews and content sniffing for e.g. PDFs).
        const resolvedContentType = contentType ?? upload.mime_type;
        if (resolvedContentType) {
          reply.header('Content-Type', resolvedContentType);
        }

        return reply.send(stream);
      } catch (error) {
        logger.error(
          toSafeLogFields(error),
          `Failed to download file ${fileId} from storage (path: ${upload.path})`
        );
        return reply.code(404).send({
          code: ApiErrorCode.FileNotFound,
          message: 'File not found.',
        });
      }
    },
  });

  done();
};
