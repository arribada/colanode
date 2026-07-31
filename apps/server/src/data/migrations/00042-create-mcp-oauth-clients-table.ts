import { Migration } from 'kysely';

// OAuth 2.1 Dynamic Client Registration (RFC 7591) store. Each row is an MCP
// client (e.g. Claude's connector) that registered itself via POST /oauth/register.
// Clients are public (PKCE, no secret) by default; secret stays NULL for those.
export const createMcpOauthClientsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('mcp_oauth_clients')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('secret', 'text')
      .addColumn('name', 'text')
      .addColumn('redirect_uris', 'jsonb', (col) => col.notNull())
      .addColumn('grant_types', 'jsonb')
      .addColumn('response_types', 'jsonb')
      .addColumn('scope', 'text')
      .addColumn('token_endpoint_auth_method', 'text')
      .addColumn('metadata', 'jsonb')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('mcp_oauth_clients').execute();
  },
};
