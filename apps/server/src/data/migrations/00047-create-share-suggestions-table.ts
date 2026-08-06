import { Migration } from 'kysely';

// Phase 2: edit suggestions submitted by an external contributor through a
// share link with `permission = 'suggest'`. Identity (first/last/email) is
// captured inline. Suggestions land as 'pending' for the owner to approve in
// Phase 3. `permission` on node_shares is widened to allow 'suggest'.
export const createShareSuggestionsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('share_suggestions')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('share_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('first_name', 'varchar(120)', (col) => col.notNull())
      .addColumn('last_name', 'varchar(120)', (col) => col.notNull())
      .addColumn('email', 'varchar(255)', (col) => col.notNull())
      .addColumn('proposed_html', 'text', (col) => col.notNull())
      .addColumn('proposed_text', 'text')
      .addColumn('status', 'varchar(20)', (col) =>
        col.notNull().defaultTo('pending')
      )
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('share_suggestions_workspace_status_idx')
      .on('share_suggestions')
      .columns(['workspace_id', 'status'])
      .execute();

    await db.schema
      .createIndex('share_suggestions_node_id_idx')
      .on('share_suggestions')
      .columns(['node_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('share_suggestions').execute();
  },
};
