import { Migration } from 'kysely';

// A version cut from the page header now writes a snapshot of its own, so the
// content behind a tag can be read back. The tag and the changelog written
// with it live beside the content.
export const addDocumentSnapshotLabel: Migration = {
  up: async (db) => {
    await db.schema
      .alterTable('document_snapshots')
      .addColumn('name', 'varchar(60)')
      .execute();

    await db.schema
      .alterTable('document_snapshots')
      .addColumn('note', 'text')
      .execute();
  },
  down: async (db) => {
    await db.schema
      .alterTable('document_snapshots')
      .dropColumn('name')
      .execute();
    await db.schema
      .alterTable('document_snapshots')
      .dropColumn('note')
      .execute();
  },
};
