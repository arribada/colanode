import Database from 'better-sqlite3';
import { Kysely, Migrator, SqliteDialect, sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceDatabaseSchema } from '@colanode/client/databases/workspace';
import { workspaceDatabaseMigrations } from '@colanode/client/databases/workspace/migrations';
import {
  buildNodeSearchPreview,
  searchNodes,
} from '@colanode/client/lib/node-search';

// The search runs its real SQL against the real migrations, on the same
// SQLite driver the desktop client uses.

let sqlite: Database.Database;
let db: Kysely<WorkspaceDatabaseSchema>;

beforeEach(async () => {
  sqlite = new Database(':memory:');
  db = new Kysely<WorkspaceDatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => workspaceDatabaseMigrations },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }
});

afterEach(() => {
  sqlite.close();
});

interface NodeInput {
  id: string;
  name: string;
  type?: string;
  parentId?: string;
  rootId?: string;
  body?: string;
  values?: string;
  createdAt?: string;
  updatedAt?: string | null;
  createdBy?: string;
  deletedAt?: string;
}

const addNode = async (input: NodeInput) => {
  const attributes: Record<string, unknown> = {
    type: input.type ?? 'page',
    name: input.name,
    parentId: input.parentId ?? 'space1',
  };
  if (input.deletedAt) {
    attributes.deletedAt = input.deletedAt;
  }
  await sql`
    INSERT INTO nodes (id, root_id, local_revision, server_revision, attributes, created_at, created_by, updated_at)
    VALUES (${input.id}, ${input.rootId ?? 'space1'}, 0, 0, ${JSON.stringify(attributes)},
      ${input.createdAt ?? '2026-01-01T00:00:00.000Z'}, ${input.createdBy ?? 'user1'}, ${input.updatedAt ?? null})
  `.execute(db);
  await sql`INSERT INTO node_texts (id, name, attributes) VALUES (${input.id}, ${input.name}, ${input.values ?? null})`.execute(
    db
  );
  if (input.body) {
    await sql`INSERT INTO document_texts (id, text) VALUES (${input.id}, ${input.body})`.execute(
      db
    );
  }
};

const ids = (output: { results: { id: string }[] }) =>
  output.results.map((result) => result.id);

describe('searchNodes', () => {
  it('finds a page whose title holds one word and whose body holds the other', async () => {
    await addNode({ id: 'p1', name: 'Turtle notes', body: 'The tag failed.' });
    await addNode({ id: 'p2', name: 'Turtle diary', body: 'Nothing here.' });

    const output = await searchNodes(db, { searchQuery: 'turtle tag' });
    expect(ids(output)).toEqual(['p1']);
    expect(output.total).toBe(1);
  });

  it('puts the exact title first, then titles, then bodies', async () => {
    await addNode({ id: 'body', name: 'Log', body: 'sea turtle sea turtle' });
    await addNode({ id: 'longer', name: 'Sea turtle nesting' });
    await addNode({ id: 'exact', name: 'Sea Turtle' });

    const output = await searchNodes(db, { searchQuery: 'sea turtle' });
    expect(ids(output)).toEqual(['exact', 'longer', 'body']);
  });

  it('leaves out pages that hold an excluded word, in the title or the body', async () => {
    await addNode({ id: 'keep', name: 'Tag spec' });
    await addNode({ id: 'drop1', name: 'Tag draft' });
    await addNode({ id: 'drop2', name: 'Tag plan', body: 'still a draft' });

    const output = await searchNodes(db, { searchQuery: 'tag -draft' });
    expect(ids(output)).toEqual(['keep']);
  });

  it('matches a quoted phrase only with its words side by side', async () => {
    await addNode({ id: 'a', name: 'A', body: 'the sea turtle swims' });
    await addNode({ id: 'b', name: 'B', body: 'the turtle by the sea' });

    expect(ids(await searchNodes(db, { searchQuery: '"sea turtle"' }))).toEqual(
      ['a']
    );
  });

  it('searches only titles when asked', async () => {
    await addNode({ id: 't', name: 'Doppler setup' });
    await addNode({ id: 'b', name: 'Notes', body: 'Doppler setup' });

    const output = await searchNodes(db, {
      searchQuery: 'doppler',
      filters: { titleOnly: true },
    });
    expect(ids(output)).toEqual(['t']);
  });

  it('counts every match and marks the title and an excerpt', async () => {
    await addNode({
      id: 'p',
      name: 'Tag log',
      body: 'First line\nThe tag on 12 and the tag on 14\nTags everywhere',
    });

    const [result] = (await searchNodes(db, { searchQuery: 'tag' })).results;
    expect(result!.matchCount).toBe(4);
    expect(result!.nameHighlights).toEqual([{ start: 0, end: 3 }]);
    expect(result!.snippet).toBe('The tag on 12 and the tag on 14');
    expect(
      result!.snippetHighlights.map((range) =>
        result!.snippet!.slice(range.start, range.end)
      )
    ).toEqual(['tag', 'tag']);
  });

  it('applies the type, author, place and date filters', async () => {
    await addNode({ id: 'folder', name: 'Field', type: 'folder' });
    await addNode({ id: 'inside', name: 'Field page', parentId: 'folder' });
    await addNode({
      id: 'deeper',
      name: 'Field sub',
      parentId: 'inside',
      createdBy: 'user2',
    });
    await addNode({
      id: 'old',
      name: 'Field old',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    await addNode({
      id: 'db',
      name: 'Field database',
      type: 'database',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    const search = (filters: Record<string, unknown>) =>
      searchNodes(db, { searchQuery: 'field', filters, sort: 'created_asc' });

    expect(ids(await search({ types: ['database'] }))).toEqual(['db']);
    expect(ids(await search({ createdBy: ['user2'] }))).toEqual(['deeper']);
    expect(ids(await search({ withinId: 'folder' })).sort()).toEqual([
      'deeper',
      'folder',
      'inside',
    ]);
    expect(
      ids(
        await search({
          dateField: 'created',
          dateTo: '2025-12-31T00:00:00.000Z',
        })
      )
    ).toEqual(['old']);
    expect(
      ids(
        await search({
          dateField: 'edited',
          dateFrom: '2026-02-01T00:00:00.000Z',
        })
      )
    ).toEqual(['db']);
  });

  it('keeps trashed pages and whatever is inside them out', async () => {
    await addNode({ id: 'bin', name: 'Old tags', deletedAt: '2026-02-02' });
    await addNode({ id: 'child', name: 'Tag child', parentId: 'bin' });
    await addNode({ id: 'live', name: 'Tag live' });

    expect(ids(await searchNodes(db, { searchQuery: 'tag' }))).toEqual([
      'live',
    ]);
  });

  it('sorts by date and reports the total beyond the limit', async () => {
    for (let i = 1; i <= 5; i++) {
      await addNode({
        id: `n${i}`,
        name: `Report ${i}`,
        createdAt: `2026-01-0${i}T00:00:00.000Z`,
      });
    }

    const output = await searchNodes(db, {
      searchQuery: 'report',
      sort: 'created_desc',
      limit: 2,
    });
    expect(ids(output)).toEqual(['n5', 'n4']);
    expect(output.total).toBe(5);
  });

  it('lists what the filters keep when nothing is typed', async () => {
    await addNode({ id: 'mine', name: 'Mine', createdBy: 'me' });
    await addNode({ id: 'theirs', name: 'Theirs', createdBy: 'them' });

    const output = await searchNodes(db, {
      searchQuery: '',
      filters: { createdBy: ['me'] },
    });
    expect(ids(output)).toEqual(['mine']);
    expect(output.total).toBe(1);
    expect(await searchNodes(db, { searchQuery: '' })).toEqual({
      results: [],
      total: 0,
    });
  });

  it('leaves chat messages out unless chat is shown, and keeps page comments', async () => {
    await addNode({ id: 'chat1', name: 'General', type: 'channel' });
    await addNode({
      id: 'msg1',
      name: 'beacon in chat',
      type: 'message',
      rootId: 'chat1',
      parentId: 'chat1',
    });
    await addNode({
      id: 'comment',
      name: 'beacon in a comment',
      type: 'message',
    });

    expect(ids(await searchNodes(db, { searchQuery: 'beacon' }))).toEqual([
      'comment',
    ]);
    expect(
      ids(
        await searchNodes(db, {
          searchQuery: 'beacon',
          filters: { includeChat: true },
        })
      ).sort()
    ).toEqual(['comment', 'msg1']);
  });
});

describe('buildNodeSearchPreview', () => {
  it('lists each passage with what a find bar needs to land on it', async () => {
    await addNode({
      id: 'p',
      name: 'Nesting',
      body: 'Tortue verte\nUne tortue, deux tortues\nFin',
    });

    const preview = await buildNodeSearchPreview(db, 'p', 'tortu');
    expect(preview!.matchCount).toBe(3);
    expect(preview!.passages.map((passage) => passage.text)).toEqual([
      'Tortue verte',
      'Une tortue, deux tortues',
    ]);
    // The second passage opens on the second "tortu" of the body.
    expect(preview!.passages[1]).toMatchObject({
      findText: 'tortu',
      findOccurrence: 1,
      source: 'content',
    });
    expect(preview!.wordCount).toBe(7);
    expect(preview!.opening).toBeNull();
  });

  it('shows the opening of the body when the query is not in it', async () => {
    await addNode({ id: 'p', name: 'Nesting', body: 'Beach survey notes' });
    const preview = await buildNodeSearchPreview(db, 'p', 'nesting');
    expect(preview!.matchCount).toBe(1);
    expect(preview!.passages).toEqual([]);
    expect(preview!.opening).toBe('Beach survey notes');
  });
});
