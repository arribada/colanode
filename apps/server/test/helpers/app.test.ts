import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { database } from '@colanode/server/data/database';

import { buildTestApp, loginAsTestSeedUser, seedTestState } from './app';
import { TEST_SEED_ACCOUNT_EMAIL } from '../../src/api/client/routes/test/seed-state';

/**
 * Exercises the DEV-GATED `/client/v1/test/*` seam end-to-end: Fastify
 * plugin registration, the zod response schemas, and the onRequest gate
 * behavior in apps/server/src/api/client/routes/test/guard.ts. Safe to run
 * alongside every other `test/api/*.test.ts` file — `resetTestDatabase`
 * (see seed-state.ts) only ever touches the one fixed-identity fixture
 * account's own rows, never a full-table wipe.
 */
const app = buildTestApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('DEV-GATED /client/v1/test/* seam', () => {
  it('is a 404 no-op when ENABLE_TEST_ENDPOINTS is not set', async () => {
    delete process.env.ENABLE_TEST_ENDPOINTS;

    const response = await app.inject({
      method: 'POST',
      url: '/client/v1/test/seed',
    });

    expect(response.statusCode).toBe(404);
  });

  describe('with ENABLE_TEST_ENDPOINTS=true', () => {
    beforeAll(() => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';
    });

    afterAll(() => {
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });

    it('seeds the fixed fixture account/workspace and logs in as it', async () => {
      const seeded = await seedTestState(app);

      expect(seeded.email).toBe(TEST_SEED_ACCOUNT_EMAIL);
      expect(seeded.accountId).toBeTruthy();
      expect(seeded.workspaceId).toBeTruthy();

      const session = await loginAsTestSeedUser(app);

      expect(session.type).toBe('success');
      expect(session.account.id).toBe(seeded.accountId);
      expect(session.token).toBeTruthy();
      expect(session.deviceId).toBeTruthy();
      expect(
        session.workspaces.some(
          (workspace) => workspace.id === seeded.workspaceId
        )
      ).toBe(true);
    });

    it('re-seeding replaces the fixture row instead of accumulating duplicates', async () => {
      const first = await seedTestState(app);
      const second = await seedTestState(app);

      expect(second.workspaceId).not.toBe(first.workspaceId);

      const accounts = await database
        .selectFrom('accounts')
        .selectAll()
        .where('email', '=', TEST_SEED_ACCOUNT_EMAIL)
        .execute();

      expect(accounts).toHaveLength(1);
    });
  });
});
