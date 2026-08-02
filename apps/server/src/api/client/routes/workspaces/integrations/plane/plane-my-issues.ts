// ABOUTME: Server proxy route for the wiki home "My Plane tickets" section —
// ABOUTME: returns the authenticated user's assigned Plane issues (by email).
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  apiErrorOutputSchema,
  planeMyIssuesOutputSchema,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { fetchPlaneMyIssues } from '@colanode/server/lib/plane';

// GET /client/v1/workspaces/:workspaceId/integrations/plane/my-issues
//
// Server-side proxy that returns the *authenticated* user's assigned Plane
// issues, flattened across the configured Plane workspace's projects, for the
// wiki home "My Plane tickets" section. `workspaceId` is the *Colanode*
// workspace (validated by `workspaceAuthenticator` ahead of this handler — the
// proxy access-check). The caller's email is resolved server-side from the
// authenticated user row and matched to a Plane member; it is never taken from
// the client. The Plane API token lives only in server config and is attached
// server-side by `fetchPlaneMyIssues`.
export const planeMyIssuesRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/my-issues',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      response: {
        200: planeMyIssuesOutputSchema,
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

      // Resolve the caller's email server-side — never trust a client-supplied
      // identity. `request.workspace.user.id` was set by
      // `workspaceAuthenticator`; the user row carries the workspace email.
      const user = await database
        .selectFrom('users')
        .select('email')
        .where('id', '=', request.workspace.user.id)
        .executeTakeFirst();

      // Authenticated but no user row (a race past the auth guard) — treat as
      // "no Plane match" rather than an error, so the home never breaks.
      if (!user) {
        return [];
      }

      const result = await fetchPlaneMyIssues(planeConfig, user.email);

      if (!result.ok) {
        return reply.code(502).send({
          code: ApiErrorCode.PlaneFetchFailed,
          message: 'Failed to fetch your Plane issues.',
        });
      }

      return result.issues;
    },
  });

  done();
};
