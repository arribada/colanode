import { Migration } from 'kysely';

// Per-user favorites: a user can star any node (page/record/…) and it surfaces
// in a "Favorites" section at the top of their sidebar. A favorite is scoped to
// one user in one workspace, so the primary key is (user_id, node_id) — the same
// node can be favorited independently by different users.
export const createNodeFavoritesTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('node_favorites')
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addPrimaryKeyConstraint('node_favorites_pkey', ['user_id', 'node_id'])
      .execute();

    await db.schema
      .createIndex('node_favorites_user_id_idx')
      .on('node_favorites')
      .columns(['user_id'])
      .execute();

    await db.schema
      .createIndex('node_favorites_workspace_id_idx')
      .on('node_favorites')
      .columns(['workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('node_favorites').execute();
  },
};
