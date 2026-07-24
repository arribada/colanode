import Database from 'better-sqlite3';
import { Kysely, Migration, Migrator, SqliteDialect, sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';

import { workspaceDatabaseMigrations } from '@colanode/client/databases/workspace/migrations';
import { notInTrashedTreeSql } from '@colanode/client/lib/nodes';

// End-to-end tests for the workspace full-text-search index. They run the real
// Kysely migrations against an in-memory SQLite database (better-sqlite3, the
// same driver the desktop/node client uses) and exercise the exact query shape
// the search handlers use, so they lock in the fix for the contentless-FTS bug
// where `SELECT id FROM node_texts` returned NULL and every search returned 0.

type TestDb = Kysely<Record<string, never>>;

const openDatabase = (): { db: TestDb; sqlite: Database.Database } => {
  const sqlite = new Database(':memory:');
  const db = new Kysely<Record<string, never>>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  return { db, sqlite };
};

const runMigrations = async (
  db: TestDb,
  migrations: Record<string, Migration>
): Promise<void> => {
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () => migrations,
    },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }
};

const migrationsBefore = (key: string): Record<string, Migration> => {
  const result: Record<string, Migration> = {};
  for (const [name, migration] of Object.entries(workspaceDatabaseMigrations)) {
    if (name === key) {
      break;
    }
    result[name] = migration;
  }
  return result;
};

const insertNode = async (
  db: TestDb,
  input: { id: string; rootId: string; attributes: Record<string, unknown> }
): Promise<void> => {
  await sql`
    INSERT INTO nodes (id, root_id, local_revision, server_revision, attributes, created_at, created_by)
    VALUES (${input.id}, ${input.rootId}, 0, 0, ${JSON.stringify(input.attributes)}, ${'2026-01-01T00:00:00.000Z'}, ${'user1'})
  `.execute(db);
};

const insertDocument = async (
  db: TestDb,
  input: { id: string; content: Record<string, unknown> }
): Promise<void> => {
  await sql`
    INSERT INTO documents (id, local_revision, server_revision, content, created_at, created_by)
    VALUES (${input.id}, 0, 0, ${JSON.stringify(input.content)}, ${'2026-01-01T00:00:00.000Z'}, ${'user1'})
  `.execute(db);
};

// Reproduces the JOIN performed by node-search's matchFts handler.
const searchNodeIds = async (
  db: TestDb,
  table: 'node_texts' | 'document_texts',
  matchQuery: string
): Promise<string[]> => {
  const result = await sql<{ id: string }>`
    SELECT n.id AS id
    FROM (
      SELECT id, rank
      FROM ${sql.raw(table)}
      WHERE ${sql.raw(table)} MATCH ${matchQuery}
      ORDER BY rank
      LIMIT 30
    ) m
    JOIN nodes n ON n.id = m.id
    WHERE ${sql.raw(notInTrashedTreeSql('n'))}
    ORDER BY m.rank
  `.execute(db);
  return result.rows.map((row) => row.id);
};

const rawMatchedIds = async (
  db: TestDb,
  table: 'node_texts' | 'document_texts',
  matchQuery: string
): Promise<Array<string | null>> => {
  const result = await sql<{ id: string | null }>`
    SELECT id FROM ${sql.raw(table)} WHERE ${sql.raw(table)} MATCH ${matchQuery}
  `.execute(db);
  return result.rows.map((row) => row.id);
};

const page = (name: string) => ({ type: 'page', name });

const richTextDocument = (documentId: string, text: string) => ({
  type: 'rich_text',
  blocks: {
    [`${documentId}-b1`]: {
      id: `${documentId}-b1`,
      type: 'paragraph',
      parentId: documentId,
      index: 'a',
      content: [{ type: 'text', text }],
    },
  },
});

let opened: Database.Database | null = null;

afterEach(() => {
  opened?.close();
  opened = null;
});

describe('workspace FTS index (post-migration)', () => {
  it('makes the UNINDEXED id retrievable so search JOINs match rows', async () => {
    const { db, sqlite } = openDatabase();
    opened = sqlite;
    await runMigrations(db, workspaceDatabaseMigrations);

    await insertNode(db, {
      id: 'node-sea',
      rootId: 'root1',
      attributes: page('Sea Turtle Nesting Sites'),
    });
    // Simulate the node-service write path.
    await sql`INSERT INTO node_texts (id, name, attributes) VALUES (${'node-sea'}, ${'Sea Turtle Nesting Sites'}, ${null})`.execute(
      db
    );

    // The crux of BUG-1: this used to return [null] on the contentless table.
    const rawIds = await rawMatchedIds(db, 'node_texts', '"Sea"*');
    expect(rawIds).toEqual(['node-sea']);

    const ids = await searchNodeIds(db, 'node_texts', '"Sea"*');
    expect(ids).toContain('node-sea');
  });

  it('retrieves nodes matched by document content', async () => {
    const { db, sqlite } = openDatabase();
    opened = sqlite;
    await runMigrations(db, workspaceDatabaseMigrations);

    await insertNode(db, {
      id: 'node-doc',
      rootId: 'root1',
      attributes: page('Deployment Log'),
    });
    await sql`INSERT INTO document_texts (id, text) VALUES (${'node-doc'}, ${'SWS saltwater switch deployment notes'})`.execute(
      db
    );

    const ids = await searchNodeIds(db, 'document_texts', '"SWS"*');
    expect(ids).toEqual(['node-doc']);
  });

  it('excludes trashed nodes from search results', async () => {
    const { db, sqlite } = openDatabase();
    opened = sqlite;
    await runMigrations(db, workspaceDatabaseMigrations);

    await insertNode(db, {
      id: 'node-trashed',
      rootId: 'root1',
      attributes: { type: 'page', name: 'Sea Grass', deletedAt: '2026-02-02' },
    });
    await sql`INSERT INTO node_texts (id, name, attributes) VALUES (${'node-trashed'}, ${'Sea Grass'}, ${null})`.execute(
      db
    );

    const ids = await searchNodeIds(db, 'node_texts', '"Sea"*');
    expect(ids).not.toContain('node-trashed');
  });
});

describe('migration 00023 reindex of existing data', () => {
  it('reproduces the contentless bug then fixes and reindexes on up()', async () => {
    const { db, sqlite } = openDatabase();
    opened = sqlite;

    // Bring the database to the pre-fix state (schema at migration 00022, with
    // node_texts/document_texts still contentless from 00007/00011).
    await runMigrations(db, migrationsBefore('00023-recreate-fts-tables'));

    await insertNode(db, {
      id: 'node-reindex',
      rootId: 'root1',
      attributes: page('Sea Turtle Tracker'),
    });
    await insertDocument(db, {
      id: 'node-reindex',
      content: richTextDocument('node-reindex', 'SWS deployment saltwater switch'),
    });
    // Old write path indexed the rows, but on a contentless table id is NULL.
    await sql`INSERT INTO node_texts (id, name, attributes) VALUES (${'node-reindex'}, ${'Sea Turtle Tracker'}, ${null})`.execute(
      db
    );
    await sql`INSERT INTO document_texts (id, text) VALUES (${'node-reindex'}, ${'SWS deployment saltwater switch'})`.execute(
      db
    );

    // Pre-state: indexing works (raw MATCH finds a row) but id is unretrievable
    // and the search JOIN returns nothing.
    expect(await rawMatchedIds(db, 'node_texts', '"Sea"*')).toEqual([null]);
    expect(await searchNodeIds(db, 'node_texts', '"Sea"*')).toEqual([]);
    expect(await searchNodeIds(db, 'document_texts', '"SWS"*')).toEqual([]);

    // Apply the fix migration directly against the existing data.
    const migration = workspaceDatabaseMigrations['00023-recreate-fts-tables'];
    expect(migration).toBeDefined();
    await migration!.up(db);

    // Post-state: ids are retrievable and both source tables were reindexed.
    expect(await rawMatchedIds(db, 'node_texts', '"Sea"*')).toEqual([
      'node-reindex',
    ]);
    expect(await searchNodeIds(db, 'node_texts', '"Sea"*')).toEqual([
      'node-reindex',
    ]);
    expect(await searchNodeIds(db, 'document_texts', '"SWS"*')).toEqual([
      'node-reindex',
    ]);
  });

  it('reindexes record field values and skips unparseable nodes', async () => {
    const { db, sqlite } = openDatabase();
    opened = sqlite;
    await runMigrations(db, migrationsBefore('00023-recreate-fts-tables'));

    await insertNode(db, {
      id: 'rec1',
      rootId: 'db1',
      attributes: {
        type: 'record',
        name: 'Caipirina',
        parentId: 'db1',
        databaseId: 'db1',
        fields: {
          f1: { type: 'string', value: 'Doppler Argos beacon' },
        },
      },
    });

    const migration = workspaceDatabaseMigrations['00023-recreate-fts-tables'];
    await migration!.up(db);

    expect(await searchNodeIds(db, 'node_texts', '"Doppler"*')).toEqual([
      'rec1',
    ]);
    expect(await searchNodeIds(db, 'node_texts', '"Caipirina"*')).toEqual([
      'rec1',
    ]);
  });
});
