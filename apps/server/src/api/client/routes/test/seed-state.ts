import { AccountStatus, WorkspaceOutput } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectAccount } from '@colanode/server/data/schema';
import {
  generatePasswordHash,
  insertAccount,
} from '@colanode/server/lib/accounts';
import { createDefaultWorkspace } from '@colanode/server/lib/workspaces';

/**
 * Fixed, well-known identity for the `/test/seed` fixture account. Tests
 * authenticate against it via `POST /client/v1/test/login` instead of
 * registering + verifying a throwaway account through the UI.
 */
export const TEST_SEED_ACCOUNT_EMAIL = 'test-seed@colanode.dev';
export const TEST_SEED_ACCOUNT_PASSWORD = 'ColanodeTestSeed123!';
export const TEST_SEED_ACCOUNT_NAME = 'Test Seed User';

export interface TestSeedState {
  account: SelectAccount;
  workspace: WorkspaceOutput;
}

/**
 * Deletes only the rows a *previous* `/test/seed` call could have produced
 * for the single fixed-identity fixture account (`TEST_SEED_ACCOUNT_EMAIL`),
 * in FK-safe (children-first) order, so each seed starts from a clean,
 * deterministic slate.
 *
 * Deliberately scoped to this one account's own workspace(s) rather than
 * truncating the tables — this route runs against the single shared
 * Postgres testcontainer the whole server test suite uses
 * (apps/server/test/global-setup.ts), and Vitest runs test files
 * concurrently by default. A full-table wipe would race-delete fixtures
 * other concurrently-running apps/server/test/api/*.test.ts files depend
 * on (they use unique-id fixtures precisely to coexist safely on that
 * shared database). Scoping deletes to rows reachable from this fixture's
 * own account/workspace id(s) keeps the reset hermetic — safe to call
 * alongside any other suite (testability.md, Group D).
 */
const resetTestDatabase = async (): Promise<void> => {
  const existingAccount = await database
    .selectFrom('accounts')
    .select('id')
    .where('email', '=', TEST_SEED_ACCOUNT_EMAIL)
    .executeTakeFirst();

  if (!existingAccount) {
    return;
  }

  const accountId = existingAccount.id;

  const ownedWorkspaces = await database
    .selectFrom('workspaces')
    .select('id')
    .where('created_by', '=', accountId)
    .execute();

  const workspaceIds = ownedWorkspaces.map((workspace) => workspace.id);

  if (workspaceIds.length > 0) {
    await database
      .deleteFrom('notifications')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('node_embeddings')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('document_embeddings')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('document_updates')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('documents')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('uploads')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('collaborations')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('node_tombstones')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('node_paths')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('node_reactions')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('node_interactions')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('node_updates')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('nodes')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('users')
      .where('workspace_id', 'in', workspaceIds)
      .execute();
    await database
      .deleteFrom('workspaces')
      .where('id', 'in', workspaceIds)
      .execute();
  }

  await database.deleteFrom('devices').where('account_id', '=', accountId).execute();
  await database.deleteFrom('accounts').where('id', '=', accountId).execute();
};

/**
 * Creates one deterministic account + default workspace fixture, reusing
 * `insertAccount` (also used by `test/helpers/seed.ts`'s `createAccount`,
 * so the row shape never drifts between the two test fixtures) and
 * `createDefaultWorkspace` (the same production function
 * `buildLoginSuccessOutput` and `email/register` call for a brand-new
 * account).
 */
const seedTestState = async (): Promise<TestSeedState> => {
  const passwordHash = await generatePasswordHash(TEST_SEED_ACCOUNT_PASSWORD);

  const account = await insertAccount({
    email: TEST_SEED_ACCOUNT_EMAIL,
    name: TEST_SEED_ACCOUNT_NAME,
    status: AccountStatus.Active,
    passwordHash,
  });

  const workspace = await createDefaultWorkspace(account);

  return { account, workspace };
};

export const resetAndSeedTestState = async (): Promise<TestSeedState> => {
  await resetTestDatabase();
  return seedTestState();
};

/**
 * Looks up the single fixture account `resetAndSeedTestState` creates.
 * Deliberately hardcoded to `TEST_SEED_ACCOUNT_EMAIL` (no caller-supplied
 * email) — `/client/v1/test/login` must only ever be able to mint a
 * session for this one known seeded row, never for an arbitrary existing
 * account in the `accounts` table (e.g. a real user in a shared/staging
 * database).
 */
export const findTestSeedAccount = async (): Promise<SelectAccount | null> => {
  const account = await database
    .selectFrom('accounts')
    .where('email', '=', TEST_SEED_ACCOUNT_EMAIL)
    .selectAll()
    .executeTakeFirst();

  return account ?? null;
};
