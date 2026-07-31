import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  apiErrorOutputSchema,
  planeProjectsListOutputSchema,
} from '@colanode/core';
import { config } from '@colanode/server/lib/config';
import { fetchPlaneProjects } from '@colanode/server/lib/plane';

// GET /client/v1/workspaces/:workspaceId/integrations/plane/projects
//
// Server-side proxy that lists the configured Plane workspace's projects for
// the /plane embed block's project picker. `workspaceId` is the *Colanode*
// workspace (already validated by `workspaceAuthenticator` ahead of this
// handler — the proxy access-check). The Plane API token lives only in server
// config and is attached server-side by `fetchPlaneProjects`.
export const planeProjectsListRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/projects',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      response: {
        200: planeProjectsListOutputSchema,
        400: apiErrorOutputSchema,
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

      const result = await fetchPlaneProjects(planeConfig);

      if (!result.ok) {
        return reply.code(502).send({
          code: ApiErrorCode.PlaneFetchFailed,
          message: 'Failed to fetch the projects from Plane.',
        });
      }

      return result.projects;
    },
  });

  done();
};
