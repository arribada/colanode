import { FastifyPluginCallback } from 'fastify';

import { documentSnapshotGetRoute } from './document-snapshot-get';
import { documentSnapshotListRoute } from './document-snapshot-list';

export const documentRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(documentSnapshotListRoute);
  instance.register(documentSnapshotGetRoute);

  done();
};
