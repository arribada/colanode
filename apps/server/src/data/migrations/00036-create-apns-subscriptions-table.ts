import { Migration } from 'kysely';

export const createApnsSubscriptionsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('apns_subscriptions')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('device_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('device_token', 'text', (col) => col.notNull().unique())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addColumn('last_failure_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('apns_subscriptions_account_id_idx')
      .on('apns_subscriptions')
      .column('account_id')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('apns_subscriptions').execute();
  },
};
