import { Migration } from 'kysely';

// Short-lived, one-time OAuth authorization codes (PKCE). A row is created by
// GET/POST /oauth/authorize after the wiki user authenticates, and consumed
// exactly once by POST /oauth/token. Each code is bound to the acting
// {user_id, workspace_id}, the client, the exact redirect_uri and the PKCE
// code_challenge so the token exchange can be verified end-to-end.
export const createMcpOauthCodesTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('mcp_oauth_codes')
      .addColumn('code', 'text', (col) => col.notNull().primaryKey())
      .addColumn('client_id', 'text', (col) => col.notNull())
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('redirect_uri', 'text', (col) => col.notNull())
      .addColumn('code_challenge', 'text', (col) => col.notNull())
      .addColumn('code_challenge_method', 'varchar(10)', (col) => col.notNull())
      .addColumn('scope', 'text')
      .addColumn('resource', 'text')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('consumed_at', 'timestamptz')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('mcp_oauth_codes').execute();
  },
};
