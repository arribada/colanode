import { Migration } from 'kysely';

// Periodic whiteboard (node) version snapshots, written by the node updates
// merge job right before it compacts CRDT updates for a whiteboard node (see
// jobs/node-updates-merge.ts and lib/node-snapshots.ts). Mirrors
// document_snapshots, but stores the node's attributes (which hold the board
// scene) rather than a document content blob.
export const createNodeSnapshotsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('node_snapshots')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('revision', 'bigint', (col) => col.notNull())
      .addColumn('attributes', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('created_by', 'varchar(30)', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('node_snapshots_node_id_created_at_idx')
      .on('node_snapshots')
      .columns(['node_id', 'created_at'])
      .execute();

    await db.schema
      .createIndex('node_snapshots_workspace_id_idx')
      .on('node_snapshots')
      .columns(['workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('node_snapshots').execute();
  },
};
