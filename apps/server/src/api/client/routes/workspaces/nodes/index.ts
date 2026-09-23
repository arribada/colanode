import { FastifyPluginCallback } from 'fastify';

import { nodeSnapshotGetRoute } from './node-snapshot-get';
import { nodeSnapshotListRoute } from './node-snapshot-list';
import { nodeSyncGetRoute } from './node-sync-get';

export const nodeRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(nodeSnapshotListRoute);
  instance.register(nodeSnapshotGetRoute);
  instance.register(nodeSyncGetRoute);

  done();
};
