import { Migration } from 'kysely';

export const createPushSubscriptionsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('push_subscriptions')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('device_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('endpoint', 'text', (col) => col.notNull().unique())
      .addColumn('p256dh', 'text', (col) => col.notNull())
      .addColumn('auth', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addColumn('last_failure_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('push_subscriptions_account_id_idx')
      .on('push_subscriptions')
      .column('account_id')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('push_subscriptions').execute();
  },
};
