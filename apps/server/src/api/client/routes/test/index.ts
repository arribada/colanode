import { FastifyPluginCallback } from 'fastify';

import { isTestEndpointsEnabled } from './guard';
import { testLoginRoute } from './test-login';
import { testSeedRoute } from './test-seed';

/**
 * `/client/v1/test/*` — DEV-GATED test seam (testability.md, Group D).
 *
 * Every route registered below is a genuine no-op outside test/dev: the
 * `onRequest` hook hard-gates the whole subtree on
 * `isTestEndpointsEnabled()` (NODE_ENV !== 'production' AND
 * ENABLE_TEST_ENDPOINTS=true). A misconfigured or production deployment
 * gets a plain 404 before any handler runs — same as hitting an unknown
 * route, never a partial response and never a weaker auth path. This hook
 * is deliberately the single choke point (rather than per-handler checks)
 * so future routes added under `/test` inherit the gate automatically.
 */
export const testRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.addHook('onRequest', async (_request, reply) => {
    if (!isTestEndpointsEnabled()) {
      return reply.code(404).send();
    }
  });

  instance.register(testSeedRoute);
  instance.register(testLoginRoute);

  done();
};
