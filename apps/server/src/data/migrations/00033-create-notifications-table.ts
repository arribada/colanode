import { sql, Migration } from 'kysely';

export const createNotificationsTable: Migration = {
  up: async (db) => {
    await sql`
      CREATE SEQUENCE IF NOT EXISTS notifications_revision_sequence
      START WITH 1000000000 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
    `.execute(db);

    await db.schema
      .createTable('notifications')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('root_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('type', 'varchar(30)', (col) => col.notNull())
      .addColumn('source_node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('actor_id', 'varchar(30)')
      .addColumn('preview', 'jsonb', (col) =>
        col.notNull().defaultTo(sql`'{}'::jsonb`)
      )
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('read_at', 'timestamptz')
      .addColumn('revision', 'bigint', (col) =>
        col.notNull().defaultTo(sql`nextval('notifications_revision_sequence')`)
      )
      .execute();

    await db.schema
      .createIndex('notifications_user_id_revision_idx')
      .on('notifications')
      .columns(['user_id', 'revision'])
      .execute();

    await db.schema
      .createIndex('notifications_user_id_read_at_idx')
      .on('notifications')
      .columns(['user_id', 'read_at'])
      .execute();

    await db.schema
      .createIndex('notifications_dedup_idx')
      .on('notifications')
      .columns(['user_id', 'type', 'source_node_id'])
      .execute();

    await sql`
      CREATE OR REPLACE FUNCTION update_notification_revision() RETURNS TRIGGER AS $$
      BEGIN
        NEW.revision = nextval('notifications_revision_sequence');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_update_notification_revision
      BEFORE UPDATE ON notifications
      FOR EACH ROW EXECUTE FUNCTION update_notification_revision();
    `.execute(db);
  },
  down: async (db) => {
    await sql`
      DROP TRIGGER IF EXISTS trg_update_notification_revision ON notifications;
      DROP FUNCTION IF EXISTS update_notification_revision();
    `.execute(db);
    await db.schema.dropTable('notifications').execute();
    await sql`DROP SEQUENCE IF EXISTS notifications_revision_sequence`.execute(
      db
    );
  },
};
