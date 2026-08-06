import { Migration } from 'kysely';

// Public share links for a node (Phase 1: read-only). A share exposes one node
// (optionally its sub-pages) at a random token URL, with an optional password,
// an optional expiry, and a permission level. Phase 2/3 will add external
// contributor identities and an edit-suggestion/approval workflow on top.
export const createNodeSharesTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('node_shares')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('token', 'varchar(64)', (col) => col.notNull().unique())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      // 'read' now; 'suggest' reserved for the Phase 2/3 edit-suggestion flow.
      .addColumn('permission', 'varchar(20)', (col) =>
        col.notNull().defaultTo('read')
      )
      .addColumn('include_subpages', 'boolean', (col) =>
        col.notNull().defaultTo(false)
      )
      // bcrypt/argon hash; null = no password required.
      .addColumn('password_hash', 'text')
      // null = never expires.
      .addColumn('expires_at', 'timestamptz')
      .addColumn('revoked_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('created_by', 'varchar(30)', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('node_shares_node_id_idx')
      .on('node_shares')
      .columns(['node_id'])
      .execute();

    await db.schema
      .createIndex('node_shares_workspace_id_idx')
      .on('node_shares')
      .columns(['workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('node_shares').execute();
  },
};
