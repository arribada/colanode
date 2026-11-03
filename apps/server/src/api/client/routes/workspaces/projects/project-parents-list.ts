import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { projectParentsOutputSchema } from '@colanode/core';
import { listProjectParents } from '@colanode/server/lib/projects/projects';

import { projectErrorResponses, sendProjectError } from './errors';

// GET /client/v1/workspaces/:workspaceId/projects/parents
//
// The missions and product lines a new project can be created under.
export const projectParentsListRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/parents',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: projectParentsOutputSchema, ...projectErrorResponses },
    },
    handler: async (_request, reply) => {
      try {
        return await listProjectParents();
      } catch (error) {
        return sendProjectError(reply, error);
      }
    },
  });

  done();
};
