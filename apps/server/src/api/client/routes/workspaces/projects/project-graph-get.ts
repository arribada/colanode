import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { projectGraphOutputSchema } from '@colanode/core';
import { buildProjectGraphForPage } from '@colanode/server/lib/projects/graph';

import { projectErrorResponses, sendProjectError } from './errors';

// GET /client/v1/workspaces/:workspaceId/projects/graph?pageId=...
//
// The project graph of the template project the page belongs to: its pages
// and the records of its registers, in lanes, with the coverage counts.
// Built here because the server has every record; a device does not.
export const projectGraphGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/graph',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      querystring: z.object({ pageId: z.string().min(20).max(64) }),
      response: { 200: projectGraphOutputSchema, ...projectErrorResponses },
    },
    handler: async (request, reply) => {
      try {
        return await buildProjectGraphForPage(
          {
            userId: request.workspace.user.id,
            workspaceId: request.workspace.id,
          },
          request.query.pageId
        );
      } catch (error) {
        return sendProjectError(reply, error);
      }
    },
  });

  done();
};
