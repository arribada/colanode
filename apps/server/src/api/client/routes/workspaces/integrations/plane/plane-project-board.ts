import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  apiErrorOutputSchema,
  planeProjectBoardOutputSchema,
} from '@colanode/core';
import { config } from '@colanode/server/lib/config';
import { fetchPlaneProjectBoard } from '@colanode/server/lib/plane';

// GET /client/v1/workspaces/:workspaceId/integrations/plane/project/:projectId/board
//
// Server-side proxy that returns a single Plane project's board projection
// (project header + workflow states + up to one page of issues) for the
// /plane embed block. `workspaceId` is the *Colanode* workspace (validated by
// `workspaceAuthenticator` ahead of this handler — the proxy access-check);
// `projectId` is the Plane project UUID. The Plane API token never reaches the
// client — it's attached server-side by `fetchPlaneProjectBoard`.
export const planeProjectBoardRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/project/:projectId/board',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        projectId: z.string(),
      }),
      response: {
        200: planeProjectBoardOutputSchema,
        400: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
        502: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const planeConfig = config.plane;
      if (!planeConfig.enabled) {
        return reply.code(400).send({
          code: ApiErrorCode.PlaneIntegrationDisabled,
          message: 'The Plane integration is not enabled on this server.',
        });
      }

      const result = await fetchPlaneProjectBoard(
        planeConfig,
        request.params.projectId
      );

      if (!result.ok) {
        if (result.reason === 'not_found') {
          return reply.code(404).send({
            code: ApiErrorCode.PlaneProjectNotFound,
            message: 'Plane project not found.',
          });
        }

        return reply.code(502).send({
          code: ApiErrorCode.PlaneFetchFailed,
          message: 'Failed to fetch the project board from Plane.',
        });
      }

      return result.board;
    },
  });

  done();
};
