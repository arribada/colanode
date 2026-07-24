import { FastifyPluginCallback } from 'fastify';

import { planeIssueGetRoute } from './plane-issue-get';

export const planeIntegrationRoutes: FastifyPluginCallback = (
  instance,
  _,
  done
) => {
  instance.register(planeIssueGetRoute);

  done();
};
