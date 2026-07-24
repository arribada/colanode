import { Kysely, Migration, sql } from 'kysely';

import {
  DocumentContent,
  NodeAttributes,
  extractDocumentText,
  getNodeModel,
} from '@colanode/core';

const REINDEX_BATCH_SIZE = 100;

// Minimal schema for the source and FTS tables this migration reads from and
// repopulates. Declared locally so the reindex helpers stay strongly typed
// without importing the full workspace database schema (and without `any`).
interface ReindexDatabase {
  nodes: {
    id: string;
    attributes: string;
  };
  documents: {
    id: string;
    content: string;
  };
  node_texts: {
    id: string;
    name: string | null;
    attributes: string | null;
  };
  document_texts: {
    id: string;
    text: string | null;
  };
}

// Recreates node_texts and document_texts as regular (non-contentless) FTS5
// tables and reindexes existing rows.
//
// The original tables (migrations 00007 / 00011) were created contentless
// (content=''). In a contentless FTS5 table the stored column values are not
// retrievable: `SELECT id FROM node_texts` returns NULL even though `id` is
// UNINDEXED (only rowid is exposed). Every search handler then runs
// `... JOIN nodes n ON n.id = m.id`, which joins on NULL and matches nothing,
// so global search, @-mention search and record search always returned zero
// results even though indexing itself was correct.
//
// Dropping content='' (and the now-incompatible contentless_delete=1) makes the
// UNINDEXED `id` column retrievable again, so the existing SELECT-id + JOIN
// queries work unchanged. Existing rows are reindexed from the local `nodes`
// and `documents` source tables using the same text extraction the node and
// document services use to keep the FTS index current.
export const recreateFtsTablesNonContentless: Migration = {
  up: async (db) => {
    await sql`DROP TABLE IF EXISTS node_texts;`.execute(db);
    await sql`
      CREATE VIRTUAL TABLE node_texts USING fts5(id UNINDEXED, name, attributes);
    `.execute(db);

    await sql`DROP TABLE IF EXISTS document_texts;`.execute(db);
    await sql`
      CREATE VIRTUAL TABLE document_texts USING fts5(id UNINDEXED, text);
    `.execute(db);

    await reindexNodes(db);
    await reindexDocuments(db);
  },
  down: async (db) => {
    await sql`DROP TABLE IF EXISTS node_texts;`.execute(db);
    await sql`
      CREATE VIRTUAL TABLE node_texts USING fts5(id UNINDEXED, name, attributes, content='', contentless_delete=1);
    `.execute(db);

    await sql`DROP TABLE IF EXISTS document_texts;`.execute(db);
    await sql`
      CREATE VIRTUAL TABLE document_texts USING fts5(id UNINDEXED, text, content='', contentless_delete=1);
    `.execute(db);
  },
};

const reindexNodes = async (db: Kysely<ReindexDatabase>): Promise<void> => {
  const rows = await db.selectFrom('nodes').select(['id', 'attributes']).execute();

  const values: ReindexDatabase['node_texts'][] = [];
  for (const row of rows) {
    try {
      const attributes = JSON.parse(row.attributes) as NodeAttributes;
      const model = getNodeModel(attributes.type);
      if (!model) {
        continue;
      }

      const text = model.extractText(row.id, attributes);
      if (!text) {
        continue;
      }

      const name = text.name ?? null;
      const attrs = text.attributes ?? null;
      if (name === null && attrs === null) {
        continue;
      }

      values.push({ id: row.id, name, attributes: attrs });
    } catch {
      // A single unparseable/unextractable node must never abort the migration
      // and brick the client database, so skip it and keep going.
      continue;
    }
  }

  for (let i = 0; i < values.length; i += REINDEX_BATCH_SIZE) {
    const batch = values.slice(i, i + REINDEX_BATCH_SIZE);
    if (batch.length > 0) {
      await db.insertInto('node_texts').values(batch).execute();
    }
  }
};

const reindexDocuments = async (
  db: Kysely<ReindexDatabase>
): Promise<void> => {
  const rows = await db
    .selectFrom('documents')
    .select(['id', 'content'])
    .execute();

  const values: ReindexDatabase['document_texts'][] = [];
  for (const row of rows) {
    try {
      const content = JSON.parse(row.content) as DocumentContent;
      const text = extractDocumentText(row.id, content);
      if (text == null) {
        continue;
      }

      values.push({ id: row.id, text });
    } catch {
      continue;
    }
  }

  for (let i = 0; i < values.length; i += REINDEX_BATCH_SIZE) {
    const batch = values.slice(i, i + REINDEX_BATCH_SIZE);
    if (batch.length > 0) {
      await db.insertInto('document_texts').values(batch).execute();
    }
  }
};
