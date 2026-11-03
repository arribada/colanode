import { FastifyPluginCallback } from 'fastify';

import { projectAlignRoute } from './project-align';
import { projectCodeCheckRoute } from './project-code-check';
import { projectCreateRoute } from './project-create';
import { projectParentsListRoute } from './project-parents-list';

// /client/v1/workspaces/:workspaceId/projects -- the optional project
// template: where a project can go, whether a code is free, creating a
// project, aligning an existing one. See apps/server/src/lib/projects.
export const projectRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(projectParentsListRoute);
  instance.register(projectCodeCheckRoute);
  instance.register(projectCreateRoute);
  instance.register(projectAlignRoute);

  done();
};
