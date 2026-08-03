import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  NodeSnapshotOutput,
  apiErrorOutputSchema,
  nodeSnapshotOutputSchema,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';

export const nodeSnapshotGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:nodeId/snapshots/:snapshotId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        nodeId: z.string(),
        snapshotId: z.string(),
      }),
      response: {
        200: nodeSnapshotOutputSchema,
        403: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const nodeId = request.params.nodeId;
      const snapshotId = request.params.snapshotId;

      const tree = await fetchNodeTree(nodeId);
      if (tree.length === 0) {
        return reply.code(404).send({
          code: ApiErrorCode.NodeNotFound,
          message: 'Node not found.',
        });
      }

      const nodes = tree.map((node) => mapNode(node));
      const node = nodes[nodes.length - 1];
      if (!node || node.id !== nodeId) {
        return reply.code(404).send({
          code: ApiErrorCode.NodeNotFound,
          message: 'Node not found.',
        });
      }

      const role = extractNodeRole(nodes, request.workspace.user.id);
      if (role === null || !hasNodeRole(role, 'viewer')) {
        return reply.code(403).send({
          code: ApiErrorCode.NodeNoAccess,
          message: 'You do not have access to this node.',
        });
      }

      const snapshot = await database
        .selectFrom('node_snapshots')
        .selectAll()
        .where('id', '=', snapshotId)
        .where('node_id', '=', nodeId)
        .where('workspace_id', '=', request.workspace.id)
        .executeTakeFirst();

      if (!snapshot) {
        return reply.code(404).send({
          code: ApiErrorCode.NodeSnapshotNotFound,
          message: 'Node snapshot not found.',
        });
      }

      const output: NodeSnapshotOutput = {
        id: snapshot.id,
        nodeId: snapshot.node_id,
        revision: snapshot.revision,
        createdAt: snapshot.created_at.toISOString(),
        createdBy: snapshot.created_by,
        attributes: snapshot.attributes,
      };

      return output;
    },
  });

  done();
};
