import { Migration } from 'kysely';

// Per-user historical page views: records WHICH users have ever viewed a node
// (page/record) and when, powering a Notion-style "Viewed by N people" indicator.
// Distinct from LIVE presence (who is here right now). A view is scoped to one
// user in one workspace, so the primary key is (user_id, node_id) — the same node
// can be viewed independently by different users. first_viewed_at is set once on
// the first view; last_viewed_at and view_count advance on every (throttled) view.
export const createNodeViewsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('node_views')
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('first_viewed_at', 'timestamptz', (col) => col.notNull())
      .addColumn('last_viewed_at', 'timestamptz', (col) => col.notNull())
      .addColumn('view_count', 'integer', (col) => col.notNull().defaultTo(1))
      .addPrimaryKeyConstraint('node_views_pkey', ['user_id', 'node_id'])
      .execute();

    // Listing a node's viewers filters by node_id, so index it.
    await db.schema
      .createIndex('node_views_node_id_idx')
      .on('node_views')
      .columns(['node_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('node_views').execute();
  },
};
