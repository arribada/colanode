import { FastifyPluginCallback } from 'fastify';

import { nodeDocumentsGetRoute } from './node-documents-get';
import { nodeSnapshotGetRoute } from './node-snapshot-get';
import { nodeSnapshotListRoute } from './node-snapshot-list';
import { nodeSyncGetRoute } from './node-sync-get';

export const nodeRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(nodeSnapshotListRoute);
  instance.register(nodeSnapshotGetRoute);
  instance.register(nodeSyncGetRoute);
  instance.register(nodeDocumentsGetRoute);

  done();
};
