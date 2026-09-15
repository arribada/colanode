import Database from 'better-sqlite3';
import { Kysely, Migrator, SqliteDialect, sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';

import { workspaceDatabaseMigrations } from '@colanode/client/databases/workspace/migrations';
import {
  buildNodePaths,
  fetchNodePaths,
  sameNodePaths,
} from '@colanode/client/lib/node-paths';

// Runs the real workspace migrations on an in-memory SQLite database, so the
// recursive walk is checked against the generated parent_id/type columns the
// app actually uses rather than a hand-written stand-in.

type TestDb = Kysely<Record<string, never>>;

const open: { sqlite: Database.Database; db: TestDb }[] = [];

const openDatabase = async (): Promise<TestDb> => {
  const sqlite = new Database(':memory:');
  const db = new Kysely<Record<string, never>>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  open.push({ sqlite, db });

  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => workspaceDatabaseMigrations },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }
  return db;
};

afterEach(async () => {
  for (const { db } of open.splice(0)) {
    await db.destroy();
  }
});

const insertNode = async (
  db: TestDb,
  node: { id: string; type: string; name: string; parentId?: string }
): Promise<void> => {
  const attributes = {
    type: node.type,
    name: node.name,
    ...(node.parentId ? { parentId: node.parentId } : {}),
  };
  await sql`
    INSERT INTO nodes (id, root_id, local_revision, server_revision, attributes, created_at, created_by)
    VALUES (${node.id}, ${'space'}, 0, 0, ${JSON.stringify(attributes)}, ${'2026-01-01T00:00:00.000Z'}, ${'user1'})
  `.execute(db);
};

const names = (segments: { name: string | null }[]) =>
  segments.map((segment) => segment.name);

const seedTree = async (db: TestDb) => {
  await insertNode(db, { id: 'space', type: 'space', name: '🚀 Missions & Projects' });
  await insertNode(db, { id: 'tracker', type: 'page', name: 'Sea Turtle Tracker', parentId: 'space' });
  await insertNode(db, { id: 'doppler', type: 'page', name: 'Doppler (SMD)', parentId: 'tracker' });
  await insertNode(db, { id: 'gps', type: 'page', name: 'GPS', parentId: 'tracker' });
  await insertNode(db, { id: 'req-doppler', type: 'page', name: 'Requirements', parentId: 'doppler' });
  await insertNode(db, { id: 'req-gps', type: 'page', name: 'Requirements', parentId: 'gps' });
};

describe('fetchNodePaths', () => {
  it('runs from the space down to the immediate parent', async () => {
    const db = await openDatabase();
    await seedTree(db);

    const paths = await fetchNodePaths(db, ['req-doppler']);

    expect(names(paths['req-doppler'] ?? [])).toEqual([
      '🚀 Missions & Projects',
      'Sea Turtle Tracker',
      'Doppler (SMD)',
    ]);
  });

  it('tells two identically named pages apart in one query', async () => {
    const db = await openDatabase();
    await seedTree(db);

    const paths = await fetchNodePaths(db, ['req-doppler', 'req-gps']);

    expect(names(paths['req-doppler'] ?? []).at(-1)).toBe('Doppler (SMD)');
    expect(names(paths['req-gps'] ?? []).at(-1)).toBe('GPS');
  });

  it('gives a space an empty path and an unknown id an empty entry', async () => {
    const db = await openDatabase();
    await seedTree(db);

    const paths = await fetchNodePaths(db, ['space', 'missing']);

    expect(paths).toEqual({ space: [], missing: [] });
  });

  it('keeps the ancestors it can reach when a parent is not stored', async () => {
    const db = await openDatabase();
    await insertNode(db, { id: 'orphan-parent', type: 'page', name: 'Moved', parentId: 'gone' });
    await insertNode(db, { id: 'child', type: 'page', name: 'Child', parentId: 'orphan-parent' });

    const paths = await fetchNodePaths(db, ['child']);

    expect(names(paths['child'] ?? [])).toEqual(['Moved']);
  });

  it('stops on a parent cycle instead of looping', async () => {
    const db = await openDatabase();
    await insertNode(db, { id: 'a', type: 'page', name: 'A', parentId: 'b' });
    await insertNode(db, { id: 'b', type: 'page', name: 'B', parentId: 'a' });

    const paths = await fetchNodePaths(db, ['a']);

    expect((paths['a'] ?? []).length).toBeLessThanOrEqual(32);
  });

  it('asks nothing of the database for an empty request', async () => {
    const db = await openDatabase();
    expect(await fetchNodePaths(db, [])).toEqual({});
  });
});

describe('buildNodePaths', () => {
  it('orders ancestors by depth whatever order the rows arrive in', () => {
    const paths = buildNodePaths(
      ['leaf'],
      [
        { start_id: 'leaf', depth: 1, id: 'p', type: 'page', name: 'Parent', avatar: null },
        { start_id: 'leaf', depth: 0, id: 'leaf', type: 'page', name: 'Leaf', avatar: null },
        { start_id: 'leaf', depth: 2, id: 's', type: 'space', name: 'Space', avatar: null },
      ]
    );

    expect(names(paths['leaf'] ?? [])).toEqual(['Space', 'Parent']);
  });
});

describe('sameNodePaths', () => {
  it('sees a rename of an ancestor as a change', () => {
    const before = { leaf: [{ id: 'p', type: 'page', name: 'Old', avatar: null }] };
    const after = { leaf: [{ id: 'p', type: 'page', name: 'New', avatar: null }] };

    expect(sameNodePaths(before, before)).toBe(true);
    expect(sameNodePaths(before, after)).toBe(false);
  });
});
