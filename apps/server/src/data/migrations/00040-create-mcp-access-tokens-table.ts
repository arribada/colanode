import { Migration } from 'kysely';

// Per-user MCP access tokens. Each row is an opaque bearer token that lets a
// user drive the wiki from an external MCP client (e.g. Claude Desktop) through
// the remote MCP server endpoint, acting as themselves inside one workspace.
// The token is stored as-is (plaintext) for now — TODO: encrypt at rest once
// the codebase has a helper (same note as user_ai_settings).
export const createMcpAccessTokensTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('mcp_access_tokens')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('token', 'text', (col) => col.notNull().unique())
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('name', 'varchar(256)')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('last_used_at', 'timestamptz')
      .addColumn('revoked_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('mcp_access_tokens_user_workspace_idx')
      .on('mcp_access_tokens')
      .columns(['user_id', 'workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('mcp_access_tokens').execute();
  },
};
