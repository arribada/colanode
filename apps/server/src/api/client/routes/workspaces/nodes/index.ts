import { FastifyPluginCallback } from 'fastify';

import { nodeSnapshotGetRoute } from './node-snapshot-get';
import { nodeSnapshotListRoute } from './node-snapshot-list';

export const nodeRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(nodeSnapshotListRoute);
  instance.register(nodeSnapshotGetRoute);

  done();
};
