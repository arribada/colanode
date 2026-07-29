import { FastifyPluginCallback } from 'fastify';

import { planeIssueGetRoute } from './plane-issue-get';
import { planeProjectBoardRoute } from './plane-project-board';
import { planeProjectsListRoute } from './plane-projects-list';

export const planeIntegrationRoutes: FastifyPluginCallback = (
  instance,
  _,
  done
) => {
  instance.register(planeIssueGetRoute);
  instance.register(planeProjectsListRoute);
  instance.register(planeProjectBoardRoute);

  done();
};
