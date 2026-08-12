import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode, apiErrorOutputSchema } from '@colanode/core';
import { config } from '@colanode/server/lib/config';

// POST /client/v1/workspaces/:workspaceId/integrations/plane/sync
//
// Runs the Plane <-> wiki task sync on demand — the "Sync now" button, next
// to the schedule that already runs it every quarter of an hour.
//
// The engine itself lives on the host, not in this container, so this route
// is a relay rather than the work: it posts to a trigger listening on the
// docker bridge. That seam exists because this process can reach the bridge
// gateway and nothing else of the host — no filesystem, no docker socket.
//
// The trigger answers 202 immediately and syncs afterwards. A full sweep is
// about a minute, and a request held open that long is a request the user
// sends again.
export const planeSyncRunRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/sync',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      response: {
        200: z.object({
          started: z.boolean(),
          running: z.boolean().optional(),
        }),
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

      const url = process.env.PLANE_SYNC_TRIGGER_URL;
      const secret = process.env.PLANE_SYNC_TRIGGER_SECRET;
      if (!url || !secret) {
        // Deliberately a 400 and not a 500: nothing is broken, the relay has
        // simply not been pointed anywhere.
        return reply.code(400).send({
          code: ApiErrorCode.PlaneIntegrationDisabled,
          message: 'On-demand sync is not configured on this server.',
        });
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'x-sync-secret': secret },
          // Short: the trigger replies before it starts working, so anything
          // slower than this is the trigger being unreachable.
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          return reply.code(502).send({
            code: ApiErrorCode.PlaneFetchFailed,
            message: `The sync trigger refused the request (${response.status}).`,
          });
        }

        const body = (await response.json()) as {
          started?: boolean;
          running?: boolean;
        };
        // `started: false, running: true` is a normal answer, not a failure:
        // the button was pressed twice, or the schedule is mid-cycle.
        return reply.code(200).send({
          started: body.started ?? false,
          running: body.running,
        });
      } catch {
        return reply.code(502).send({
          code: ApiErrorCode.PlaneFetchFailed,
          message: 'The sync trigger did not answer.',
        });
      }
    },
  });

  done();
};
