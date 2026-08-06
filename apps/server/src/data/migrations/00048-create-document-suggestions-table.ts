import { Migration } from 'kysely';

// Unified block-level / whole-document edit suggestions. Both an in-app member
// (origin 'member', scope 'block') and an external share visitor (origin
// 'external', scope 'document') land a pending row here; a page editor reviews
// them the same way and Accepts to apply the proposed blocks in one click.
// `proposed_content` holds the proposed blocks as a RichTextContent
// ({ type:'rich_text', blocks }): for 'block' scope it is the replacement
// subtree rooted at `block_id`; for 'document' scope it is the whole document.
export const createDocumentSuggestionsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('document_suggestions')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('block_id', 'varchar(30)')
      .addColumn('scope', 'varchar(20)', (col) => col.notNull())
      .addColumn('proposed_content', 'jsonb', (col) => col.notNull())
      .addColumn('preview_text', 'text')
      .addColumn('origin', 'varchar(20)', (col) => col.notNull())
      .addColumn('author_id', 'varchar(30)')
      .addColumn('author_name', 'varchar(255)')
      .addColumn('author_email', 'varchar(255)')
      .addColumn('status', 'varchar(20)', (col) =>
        col.notNull().defaultTo('pending')
      )
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('resolved_at', 'timestamptz')
      .addColumn('resolved_by', 'varchar(30)')
      .execute();

    await db.schema
      .createIndex('document_suggestions_workspace_status_idx')
      .on('document_suggestions')
      .columns(['workspace_id', 'status'])
      .execute();

    await db.schema
      .createIndex('document_suggestions_node_status_idx')
      .on('document_suggestions')
      .columns(['node_id', 'status'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('document_suggestions').execute();
  },
};
