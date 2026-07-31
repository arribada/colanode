import { Migration } from 'kysely';

export const createNotificationMutesTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('notification_mutes')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('node_id', 'text', (col) => col.notNull())
      .addColumn('workspace_id', 'text', (col) => col.notNull())
      .addColumn('muted', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('created_at', 'text', (col) => col.notNull())
      .addColumn('updated_at', 'text')
      .addColumn('revision', 'text', (col) => col.notNull())
      .execute();
    await db.schema
      .createIndex('notification_mutes_node_id_idx')
      .on('notification_mutes')
      .column('node_id')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('notification_mutes').execute();
  },
};
