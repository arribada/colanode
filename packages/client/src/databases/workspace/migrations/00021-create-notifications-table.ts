import { Migration } from 'kysely';

export const createNotificationsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('notifications')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('workspace_id', 'text', (col) => col.notNull())
      .addColumn('root_id', 'text', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('source_node_id', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'text')
      .addColumn('preview', 'text', (col) => col.notNull().defaultTo('{}'))
      .addColumn('created_at', 'text', (col) => col.notNull())
      .addColumn('read_at', 'text')
      .addColumn('revision', 'text', (col) => col.notNull())
      .execute();
    await db.schema
      .createIndex('notifications_read_at_idx')
      .on('notifications')
      .column('read_at')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('notifications').execute();
  },
};
