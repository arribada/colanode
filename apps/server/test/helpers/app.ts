import fastifyWebsocket from '@fastify/websocket';
import { fastify, FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { LoginSuccessOutput } from '@colanode/core';
import { apiRoutes } from '@colanode/server/api';
import { clientDecorator } from '@colanode/server/api/client/plugins/client';
import { corsPlugin } from '@colanode/server/api/client/plugins/cors';
import { errorHandler } from '@colanode/server/api/client/plugins/error-handler';

export const buildTestApp = (): FastifyInstance => {
  const app = fastify();

  app.register(errorHandler);
  app.setSerializerCompiler(serializerCompiler);
  app.setValidatorCompiler(validatorCompiler);
  app.register(corsPlugin);
  app.register(fastifyWebsocket);
  app.register(clientDecorator);
  app.register(apiRoutes);

  return app;
};

/**
 * Client-side wrapper for the DEV-GATED `/client/v1/test/*` seam (see
 * apps/server/src/api/client/routes/test, testability.md Group D).
 *
 * Requires `process.env.NODE_ENV !== 'production'` AND
 * `process.env.ENABLE_TEST_ENDPOINTS === 'true'` — the gate is read fresh
 * per request, so a suite can set the flag in `beforeAll` even after
 * `buildTestApp()` already ran. Throws with a diagnostic message (rather
 * than returning a partial/undefined result) if the seam isn't reachable,
 * so a misconfigured suite fails loudly instead of silently skipping setup.
 *
 * `resetTestDatabase` (see ../../src/api/client/routes/test/seed-state.ts)
 * scopes every delete to the single fixed-identity fixture account's own
 * `accounts`/`workspaces` row(s) — never a full-table wipe — so calling
 * this from a spec sitting alongside `test/api/*.test.ts` cannot
 * race-delete fixtures other suites are using, even though Vitest runs
 * `test/**\/*.test.ts` files concurrently against the single shared
 * Postgres testcontainer (test/global-setup.ts). See `app.test.ts` in this
 * directory for an end-to-end exercise of `seedTestState` /
 * `loginAsTestSeedUser`.
 */
export const seedTestState = async (
  app: FastifyInstance
): Promise<{ accountId: string; email: string; workspaceId: string }> => {
  const response = await app.inject({
    method: 'POST',
    url: '/client/v1/test/seed',
  });

  if (response.statusCode !== 200) {
    throw new Error(
      `POST /client/v1/test/seed returned ${response.statusCode}. ` +
        'Ensure NODE_ENV !== "production" and ENABLE_TEST_ENDPOINTS=true in the test environment.'
    );
  }

  return response.json();
};

/**
 * Mints a real session for the single seeded test fixture account without
 * walking the login UI. The route always logs in as the fixed
 * `TEST_SEED_ACCOUNT_EMAIL` fixture (never a caller-supplied email — see
 * `apps/server/src/api/client/routes/test/test-login.ts` for why), so
 * `seedTestState(app)` must have run first. See `seedTestState` above for
 * the gating requirements.
 */
export const loginAsTestSeedUser = async (
  app: FastifyInstance
): Promise<LoginSuccessOutput> => {
  const response = await app.inject({
    method: 'POST',
    url: '/client/v1/test/login',
  });

  if (response.statusCode !== 200) {
    throw new Error(
      `POST /client/v1/test/login returned ${response.statusCode}. ` +
        'Call seedTestState(app) first, and ensure NODE_ENV !== "production" and ENABLE_TEST_ENDPOINTS=true.'
    );
  }

  return response.json();
};
