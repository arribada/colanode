import { sql, Migration } from 'kysely';

export const createNotificationMutesTable: Migration = {
  up: async (db) => {
    await sql`
      CREATE SEQUENCE IF NOT EXISTS notification_mutes_revision_sequence
      START WITH 1000000000 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
    `.execute(db);

    await db.schema
      .createTable('notification_mutes')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('muted', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addColumn('revision', 'bigint', (col) =>
        col
          .notNull()
          .defaultTo(sql`nextval('notification_mutes_revision_sequence')`)
      )
      .addUniqueConstraint('notification_mutes_user_node_uq', [
        'user_id',
        'node_id',
      ])
      .execute();

    await db.schema
      .createIndex('notification_mutes_user_id_revision_idx')
      .on('notification_mutes')
      .columns(['user_id', 'revision'])
      .execute();

    await sql`
      CREATE OR REPLACE FUNCTION update_notification_mute_revision() RETURNS TRIGGER AS $$
      BEGIN
        NEW.revision = nextval('notification_mutes_revision_sequence');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_update_notification_mute_revision
      BEFORE UPDATE ON notification_mutes
      FOR EACH ROW EXECUTE FUNCTION update_notification_mute_revision();
    `.execute(db);
  },
  down: async (db) => {
    await sql`
      DROP TRIGGER IF EXISTS trg_update_notification_mute_revision ON notification_mutes;
      DROP FUNCTION IF EXISTS update_notification_mute_revision();
    `.execute(db);
    await db.schema.dropTable('notification_mutes').execute();
    await sql`DROP SEQUENCE IF EXISTS notification_mutes_revision_sequence`.execute(
      db
    );
  },
};
