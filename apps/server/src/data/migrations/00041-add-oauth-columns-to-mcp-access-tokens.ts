import { Migration } from 'kysely';

// Extends mcp_access_tokens so the same table can back OAuth-issued tokens
// (Dynamic Client Registration + PKCE flow) alongside the pre-existing static
// per-user tokens. All columns are nullable so existing static tokens keep
// working unchanged (client_id/expires_at/refresh_token stay NULL for them):
//  - client_id: the OAuth client (mcp_oauth_clients.id) the token was issued to
//  - expires_at: access-token expiry; NULL means non-expiring (static tokens)
//  - refresh_token / refresh_token_expires_at: optional refresh-grant material
export const addOauthColumnsToMcpAccessTokens: Migration = {
  up: async (db) => {
    await db.schema
      .alterTable('mcp_access_tokens')
      .addColumn('client_id', 'text')
      .addColumn('expires_at', 'timestamptz')
      .addColumn('refresh_token', 'text')
      .addColumn('refresh_token_expires_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('mcp_access_tokens_refresh_token_idx')
      .on('mcp_access_tokens')
      .column('refresh_token')
      .execute();
  },
  down: async (db) => {
    await db.schema
      .dropIndex('mcp_access_tokens_refresh_token_idx')
      .execute();

    await db.schema
      .alterTable('mcp_access_tokens')
      .dropColumn('client_id')
      .dropColumn('expires_at')
      .dropColumn('refresh_token')
      .dropColumn('refresh_token_expires_at')
      .execute();
  },
};
