import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { notInTrashedTreeSql, notTrashedSql } from '@colanode/client/lib/nodes';

// Runs the soft-delete filter fragments against a real SQLite database with
// the same nodes table shape as the client workspace database (type and
// parent_id are stored generated columns over the attributes JSON).
describe('soft delete query filters', () => {
  let db: DatabaseSync;

  const insertNode = (
    id: string,
    type: string,
    parentId: string | null,
    extra: Record<string, unknown> = {}
  ) => {
    const attributes = JSON.stringify({
      type,
      parentId: parentId ?? undefined,
      name: id,
      ...extra,
    });

    db.prepare(
      `INSERT INTO nodes (id, root_id, local_revision, server_revision, attributes, created_at, created_by)
       VALUES (?, 'root1', 1, 1, ?, '2026-07-23T09:00:00.000Z', 'user1')`
    ).run(id, attributes);
  };

  const setDeletedAt = (id: string, deletedAt: string | null) => {
    if (deletedAt === null) {
      db.prepare(
        `UPDATE nodes SET attributes = json_remove(attributes, '$.deletedAt', '$.deletedBy') WHERE id = ?`
      ).run(id);
    } else {
      db.prepare(
        `UPDATE nodes SET attributes = json_set(attributes, '$.deletedAt', ?, '$.deletedBy', 'user1') WHERE id = ?`
      ).run(deletedAt, id);
    }
  };

  const selectIds = (whereSql: string): string[] => {
    const rows = db
      .prepare(`SELECT n.id AS id FROM nodes n WHERE ${whereSql} ORDER BY n.id`)
      .all() as Array<{ id: string }>;
    return rows.map((row) => row.id);
  };

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL GENERATED ALWAYS AS (json_extract(attributes, '$.type')) STORED,
        parent_id TEXT GENERATED ALWAYS AS (json_extract(attributes, '$.parentId')) STORED,
        root_id TEXT NOT NULL,
        local_revision INTEGER NOT NULL,
        server_revision INTEGER NOT NULL,
        attributes TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT
      )
    `);

    // sp1 (space)
    // ├── p1 (page) ── p2 (page) ── p3 (page)
    // └── q1 (page)
    insertNode('sp1', 'space', null);
    insertNode('p1', 'page', 'sp1');
    insertNode('p2', 'page', 'p1');
    insertNode('p3', 'page', 'p2');
    insertNode('q1', 'page', 'sp1');
  });

  afterEach(() => {
    db.close();
  });

  it('returns everything when nothing is trashed', () => {
    expect(selectIds(notTrashedSql('n'))).toEqual([
      'p1',
      'p2',
      'p3',
      'q1',
      'sp1',
    ]);
    expect(selectIds(notInTrashedTreeSql('n'))).toEqual([
      'p1',
      'p2',
      'p3',
      'q1',
      'sp1',
    ]);
  });

  it('notTrashedSql excludes only the trashed node itself', () => {
    setDeletedAt('p1', '2026-07-23T10:00:00.000Z');

    expect(selectIds(notTrashedSql('n'))).toEqual(['p2', 'p3', 'q1', 'sp1']);
  });

  it('notInTrashedTreeSql excludes the trashed node and all descendants', () => {
    setDeletedAt('p1', '2026-07-23T10:00:00.000Z');

    expect(selectIds(notInTrashedTreeSql('n'))).toEqual(['q1', 'sp1']);
  });

  it('trash listing returns only nodes with their own deletedAt', () => {
    setDeletedAt('p1', '2026-07-23T10:00:00.000Z');

    // Same filter as the node.trash.list handler: children of a trashed node
    // are hidden with it but do not show up as separate trash entries.
    expect(
      selectIds(`json_extract(n.attributes, '$.deletedAt') IS NOT NULL`)
    ).toEqual(['p1']);
  });

  it('restoring the parent brings the whole subtree back', () => {
    setDeletedAt('p1', '2026-07-23T10:00:00.000Z');
    expect(selectIds(notInTrashedTreeSql('n'))).toEqual(['q1', 'sp1']);

    setDeletedAt('p1', null);
    expect(selectIds(notInTrashedTreeSql('n'))).toEqual([
      'p1',
      'p2',
      'p3',
      'q1',
      'sp1',
    ]);
  });

  it('a child trashed on its own stays trashed when the parent is restored', () => {
    setDeletedAt('p2', '2026-07-23T10:00:00.000Z');
    setDeletedAt('p1', '2026-07-23T11:00:00.000Z');
    expect(selectIds(notInTrashedTreeSql('n'))).toEqual(['q1', 'sp1']);

    setDeletedAt('p1', null);
    expect(selectIds(notInTrashedTreeSql('n'))).toEqual(['p1', 'q1', 'sp1']);
  });

  it('treats a JSON null deletedAt as not trashed', () => {
    db.prepare(
      `UPDATE nodes SET attributes = json_set(attributes, '$.deletedAt', json('null')) WHERE id = ?`
    ).run('p1');

    expect(selectIds(notTrashedSql('n'))).toEqual([
      'p1',
      'p2',
      'p3',
      'q1',
      'sp1',
    ]);
    expect(selectIds(notInTrashedTreeSql('n'))).toEqual([
      'p1',
      'p2',
      'p3',
      'q1',
      'sp1',
    ]);
  });
});
