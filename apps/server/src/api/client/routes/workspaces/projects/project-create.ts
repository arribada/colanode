import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  projectCreateInputSchema,
  projectCreateOutputSchema,
} from '@colanode/core';
import { createProject } from '@colanode/server/lib/projects/projects';

import { projectErrorResponses, sendProjectError } from './errors';

// POST /client/v1/workspaces/:workspaceId/projects
//
// Creates a project from the template under a mission or product line, and,
// unless asked not to, creates or links its Plane project.
export const projectCreateRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: projectCreateInputSchema,
      response: { 200: projectCreateOutputSchema, ...projectErrorResponses },
    },
    handler: async (request, reply) => {
      try {
        return await createProject(
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
