import { Migration } from 'kysely';

// Workspace-level shared AI credentials (provider + API key + model). When a
// workspace admin configures these, every member's AI requests can fall back
// to this single shared key — so the team pays one bill — unless the member
// has set their own user_ai_settings. One row per workspace (workspace_id is
// the primary key). api_key is stored as-is for now — TODO: encrypt at rest
// once the codebase has a helper (same note as user_ai_settings).
export const createWorkspaceAiSettingsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('workspace_ai_settings')
      .addColumn('workspace_id', 'varchar(30)', (col) =>
        col.notNull().primaryKey()
      )
      .addColumn('provider', 'varchar(50)', (col) => col.notNull())
      .addColumn('api_key', 'text', (col) => col.notNull())
      .addColumn('model', 'varchar(100)', (col) => col.notNull())
      .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('workspace_ai_settings').execute();
  },
};
