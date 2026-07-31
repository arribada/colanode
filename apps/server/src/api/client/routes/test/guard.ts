/**
 * Hard production gate for every `/client/v1/test/*` route.
 *
 * These routes exist only so browser/e2e tests can reach a known state and
 * an authenticated session without walking the UI (testability.md, Group D
 * — Test Seams). They must be a complete no-op in production: disabled
 * unless the process is explicitly NOT running as `production` AND the
 * operator opted in via `ENABLE_TEST_ENDPOINTS=true`. This mirrors the
 * Cypress `cy.task('db:seed')` convention of an explicit, separately-gated
 * seed task rather than a route that is merely "hard to find".
 *
 * Read fresh on every call (not cached) so a test harness can flip
 * `process.env.ENABLE_TEST_ENDPOINTS` at runtime (e.g. in a `beforeAll`)
 * without needing to rebuild the Fastify app instance.
 */
export const isTestEndpointsEnabled = (): boolean => {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.ENABLE_TEST_ENDPOINTS === 'true'
  );
};
