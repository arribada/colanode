import { timingSafeEqual } from 'node:crypto';

import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { isValidProjectCode, projectParentsOutputSchema } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import {
  createProject,
  listProjectParents,
  ProjectError,
} from '@colanode/server/lib/projects/projects';

import {
  projectErrorOutputSchema,
  projectErrorResponses,
  sendProjectError,
} from '../workspaces/projects/errors';

// /client/v1/project-links -- what the Plane fork calls, server to server,
// when someone presses "Create the wiki project" on a Plane project. No user
// session: the request carries the secret both servers share
// (projects.linkSecret here, WIKI_PROJECT_LINK_SECRET on Plane), and the
// pages are created as the Plane user's wiki account when there is one, as
// the configured service account otherwise.

const secretMatches = (given: string | undefined): boolean => {
  const projects = config.projects;
  if (!projects.enabled || !projects.linkSecret || !given) {
    return false;
  }
  const expected = Buffer.from(projects.linkSecret);
  const received = Buffer.from(given);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
};

const resolveActor = async (
  workspaceId: string,
  email: string | null | undefined
): Promise<string> => {
  const projects = config.projects;
  const candidates = [email, projects.enabled ? projects.serviceEmail : null]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());

  for (const candidate of candidates) {
    const user = await database
      .selectFrom('users')
      .select(['id', 'role'])
      .where('workspace_id', '=', workspaceId)
      .where((eb) => eb(eb.fn('lower', ['email']), '=', candidate))
      .executeTakeFirst();
    if (user && user.role !== 'none') {
      return user.id;
    }
  }

  throw new ProjectError(
    403,
    'no_wiki_account',
    'Neither the Plane user nor the service account has a wiki account.'
  );
};

export const projectLinkRoutes: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.addHook('onRequest', async (request, reply) => {
    const header = request.headers['x-project-secret'];
    if (!secretMatches(Array.isArray(header) ? header[0] : header)) {
      return reply
        .code(401)
        .send({ code: 'unauthorized', message: 'Unknown caller.' });
    }
  });

  instance.route({
    method: 'GET',
    url: '/parents',
    schema: {
      response: {
        200: projectParentsOutputSchema,
        401: projectErrorOutputSchema,
        ...projectErrorResponses,
      },
    },
    handler: async (_request, reply) => {
      try {
        return await listProjectParents();
      } catch (error) {
        return sendProjectError(reply, error);
      }
    },
  });

  instance.route({
    method: 'POST',
    url: '/projects',
    schema: {
      body: z.object({
        name: z.string().min(1).max(200),
        code: z.string().min(2).max(10),
        parent_id: z.string(),
        actor_email: z.string().nullable().optional(),
        plane_project: z.object({
          project_id: z.string(),
          identifier: z.string(),
          name: z.string(),
          url: z.string(),
        }),
      }),
      response: {
        200: z.object({
          root_id: z.string(),
          overview_id: z.string(),
          url: z.string(),
        }),
        401: projectErrorOutputSchema,
        ...projectErrorResponses,
      },
    },
    handler: async (request, reply) => {
      try {
        const projects = config.projects;
        if (!projects.enabled) {
          throw new ProjectError(
            400,
            'projects_disabled',
            'The project template is not enabled on this server.'
          );
        }
        const body = request.body;
        if (
          !isValidProjectCode(body.code) ||
          body.plane_project.identifier !== body.code
        ) {
          throw new ProjectError(
            400,
            'invalid_code',
            'The wiki code must be the Plane identifier, 2 to 10 capital letters.'
          );
        }

        const workspaceId = projects.workspaceId;
        const userId = await resolveActor(workspaceId, body.actor_email);
        const created = await createProject(
          { userId, workspaceId },
          {
            parentId: body.parent_id,
            name: body.name,
            code: body.code,
            plane: 'none',
            planeProject: {
              projectId: body.plane_project.project_id,
              identifier: body.plane_project.identifier,
              name: body.plane_project.name,
              url: body.plane_project.url,
              wikiNodeId: null,
              archived: false,
            },
          }
        );

        return {
          root_id: created.rootId,
          overview_id: created.overviewId,
          url: `https://docs.arribada.org/${workspaceId}/${created.overviewId}`,
        };
      } catch (error) {
        return sendProjectError(reply, error);
      }
    },
  });

  done();
};
