import { FastifyPluginCallback } from 'fastify';

import { planeIssueGetRoute } from './plane-issue-get';
import { planeMyIssuesRoute } from './plane-my-issues';
import { planeProjectBoardRoute } from './plane-project-board';
import { planeProjectsListRoute } from './plane-projects-list';
import { planeSyncRunRoute } from './plane-sync-run';

export const planeIntegrationRoutes: FastifyPluginCallback = (
  instance,
  _,
  done
) => {
  instance.register(planeIssueGetRoute);
  instance.register(planeProjectsListRoute);
  instance.register(planeProjectBoardRoute);
  instance.register(planeMyIssuesRoute);
  instance.register(planeSyncRunRoute);

  done();
};
