import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  projectAlignInputSchema,
  projectAlignOutputSchema,
} from '@colanode/core';
import { alignProject } from '@colanode/server/lib/projects/projects';

import { projectErrorResponses, sendProjectError } from './errors';

// POST /client/v1/workspaces/:workspaceId/projects/align
//
// With apply=false, returns what aligning the page on the template would
// do, changing nothing. With apply=true, does it.
export const projectAlignRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/align',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: projectAlignInputSchema,
      response: { 200: projectAlignOutputSchema, ...projectErrorResponses },
    },
    handler: async (request, reply) => {
      try {
        return await alignProject(
          {
            userId: request.workspace.user.id,
            workspaceId: request.workspace.id,
          },
          request.body
        );
      } catch (error) {
        return sendProjectError(reply, error);
      }
    },
  });

  done();
};
