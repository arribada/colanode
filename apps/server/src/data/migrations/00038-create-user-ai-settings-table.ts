import { Migration } from 'kysely';

// Per-user AI credentials (provider + API key + model), used to build the LLM
// for that user's own AI requests in place of the server-global config.ai.
// One row per workspace user (user_id is the primary key). api_key is stored
// as-is for now — TODO: encrypt at rest once the codebase has a helper.
export const createUserAiSettingsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('user_ai_settings')
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('provider', 'varchar(50)', (col) => col.notNull())
      .addColumn('api_key', 'text', (col) => col.notNull())
      .addColumn('model', 'varchar(100)', (col) => col.notNull())
      .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('user_ai_settings_workspace_id_idx')
      .on('user_ai_settings')
      .columns(['workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('user_ai_settings').execute();
  },
};
