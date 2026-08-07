import { Migration } from 'kysely';

export const createNodeTombstonesTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('node_tombstones')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('root_id', 'text', (col) => col.notNull())
      .addColumn('revision', 'text', (col) => col.notNull())
      .addColumn('created_at', 'text', (col) => col.notNull())
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('node_tombstones').execute();
  },
};
