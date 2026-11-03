import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { projectCodeCheckOutputSchema } from '@colanode/core';
import {
  checkProjectCode,
  getProjectsConfig,
} from '@colanode/server/lib/projects/projects';

import { projectErrorResponses, sendProjectError } from './errors';

// GET /client/v1/workspaces/:workspaceId/projects/code?code=MARLIN
//
// Whether a code is free on the wiki, and what Plane has under that
// identifier -- so the dialog can offer "link to the existing Plane
// project" instead of failing on create.
export const projectCodeCheckRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/code',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      querystring: z.object({ code: z.string().max(20) }),
      response: { 200: projectCodeCheckOutputSchema, ...projectErrorResponses },
    },
    handler: async (request, reply) => {
      try {
        getProjectsConfig();
        return await checkProjectCode(request.workspace.id, request.query.code);
      } catch (error) {
        return sendProjectError(reply, error);
      }
    },
  });

  done();
};
