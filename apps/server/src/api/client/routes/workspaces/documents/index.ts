import { FastifyPluginCallback } from 'fastify';

import { documentSnapshotCreateRoute } from './document-snapshot-create';
import { documentSnapshotGetRoute } from './document-snapshot-get';
import { documentSnapshotListRoute } from './document-snapshot-list';
import { documentUpdateGetRoute } from './document-update-get';
import { documentUpdateListRoute } from './document-update-list';

export const documentRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(documentSnapshotListRoute);
  instance.register(documentSnapshotGetRoute);
  instance.register(documentSnapshotCreateRoute);
  instance.register(documentUpdateListRoute);
  instance.register(documentUpdateGetRoute);

  done();
};
