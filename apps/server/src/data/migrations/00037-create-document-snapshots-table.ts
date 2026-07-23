import { Migration } from 'kysely';

// Periodic document version snapshots, written by the document updates
// merge job right before it compacts CRDT updates (see
// jobs/document-updates-merge.ts and lib/document-snapshots.ts).
export const createDocumentSnapshotsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('document_snapshots')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('document_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('revision', 'bigint', (col) => col.notNull())
      .addColumn('content', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('created_by', 'varchar(30)', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('document_snapshots_document_id_created_at_idx')
      .on('document_snapshots')
      .columns(['document_id', 'created_at'])
      .execute();

    await db.schema
      .createIndex('document_snapshots_workspace_id_idx')
      .on('document_snapshots')
      .columns(['workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('document_snapshots').execute();
  },
};
