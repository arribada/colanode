import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  apiErrorOutputSchema,
  parsePlaneIssueUrl,
  planeIssueOutputSchema,
} from '@colanode/core';
import { config } from '@colanode/server/lib/config';
import { fetchPlaneIssue } from '@colanode/server/lib/plane';

// GET /client/v1/workspaces/:workspaceId/integrations/plane/issue?url=...
//
// Server-side proxy for the Plane issue link chip. `workspaceId` here is the
// *Colanode* workspace (validated by `workspaceAuthenticator` ahead of this
// handler, same as every other workspace-scoped route — this is the
// "proxy access-check": a request only reaches the handler below once the
// caller is confirmed to be an active member of that Colanode workspace).
// `url` is the pasted Plane issue link; it never carries the Plane API
// token, which lives only in server config and is attached server-side by
// `fetchPlaneIssue`.
export const planeIssueGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/issue',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      querystring: z.object({
        url: z.string(),
      }),
      response: {
        200: planeIssueOutputSchema,
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

      const parts = parsePlaneIssueUrl(request.query.url);
      if (!parts) {
        return reply.code(400).send({
          code: ApiErrorCode.PlaneInvalidIssueUrl,
          message: 'The provided URL is not a valid Plane issue link.',
        });
      }

      const result = await fetchPlaneIssue(planeConfig, parts);

      if (!result.ok) {
        if (result.reason === 'workspace_mismatch') {
          return reply.code(400).send({
            code: ApiErrorCode.PlaneWorkspaceMismatch,
            message:
              'This Plane issue belongs to a workspace this server is not configured for.',
          });
        }

        if (result.reason === 'not_found') {
          return reply.code(404).send({
            code: ApiErrorCode.PlaneIssueNotFound,
            message: 'Plane issue not found.',
          });
        }

        return reply.code(502).send({
          code: ApiErrorCode.PlaneFetchFailed,
          message: 'Failed to fetch the issue from Plane.',
        });
      }

      return result.issue;
    },
  });

  done();
};
