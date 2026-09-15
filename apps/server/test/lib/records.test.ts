import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import { queryDatabase } from '@colanode/server/lib/ai/tools';
import { createNode } from '@colanode/server/lib/nodes';
import {
  buildSearchRecordsQuery,
  searchRecords,
} from '@colanode/server/lib/records';

import {
  createAccount,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const NOTES_FIELD = 'notesfield';

const createDatabase = async (input: {
  workspaceId: string;
  userId: string;
  spaceId: string;
  name: string;
}): Promise<string> => {
  const id = generateId(IdType.Database);
  const attributes: NodeAttributes = {
    type: 'database',
    name: input.name,
    parentId: input.spaceId,
    fields: {
      [NOTES_FIELD]: {
        id: NOTES_FIELD,
        type: 'text',
        name: 'Notes',
        index: 'a0',
      },
    },
  };
  const created = await createNode({
    nodeId: id,
    rootId: input.spaceId,
    attributes,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!created) {
    throw new Error('Failed to create database');
  }
  return id;
};

const createRecord = async (input: {
  workspaceId: string;
  userId: string;
  spaceId: string;
  databaseId: string;
  name: string;
  notes?: string;
  deletedAt?: string;
}): Promise<string> => {
  const id = generateId(IdType.Record);
  const attributes: NodeAttributes = {
    type: 'record',
    parentId: input.databaseId,
    databaseId: input.databaseId,
    name: input.name,
    fields: input.notes
      ? { [NOTES_FIELD]: { type: 'text', value: input.notes } }
      : {},
    ...(input.deletedAt
      ? { deletedAt: input.deletedAt, deletedBy: input.userId }
      : {}),
  };
  const created = await createNode({
    nodeId: id,
    rootId: input.spaceId,
    attributes,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!created) {
    throw new Error('Failed to create record');
  }
  return id;
};

const seed = async () => {
  const accountA = await createAccount();
  const accountB = await createAccount();
  const workspace = await createWorkspace({ createdBy: accountA.id });
  const userA = await createUser({
    workspaceId: workspace.id,
    account: accountA,
    role: 'owner',
  });
  const userB = await createUser({
    workspaceId: workspace.id,
    account: accountB,
    role: 'collaborator',
  });

  // Two collaborators on the shared space: the old join produced one row per
  // collaboration, which is what multiplied the results.
  const sharedSpace = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
    collaborators: { [userB.id]: 'editor' },
  });
  // A space A cannot see at all.
  const privateSpaceOfB = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userB.id,
  });

  const base = { workspaceId: workspace.id, userId: userA.id };
  const target = await createDatabase({
    ...base,
    spaceId: sharedSpace,
    name: 'Target',
  });
  const sibling = await createDatabase({
    ...base,
    spaceId: sharedSpace,
    name: 'Sibling',
  });
  const hidden = await createDatabase({
    workspaceId: workspace.id,
    userId: userB.id,
    spaceId: privateSpaceOfB,
    name: 'Hidden',
  });

  const inTarget = { ...base, spaceId: sharedSpace, databaseId: target };
  const byName = await createRecord({ ...inTarget, name: 'Energy budget' });
  const byField = await createRecord({
    ...inTarget,
    name: 'Power notes',
    notes: 'energy harvesting from the solar panel',
  });
  await createRecord({ ...inTarget, name: 'Antenna', notes: 'ground plane' });
  await createRecord({
    ...inTarget,
    name: 'Energy draft',
    deletedAt: new Date().toISOString(),
  });

  await createRecord({
    ...base,
    spaceId: sharedSpace,
    databaseId: sibling,
    name: 'Energy in the sibling database',
    notes: 'energy',
  });
  await createRecord({
    workspaceId: workspace.id,
    userId: userB.id,
    spaceId: privateSpaceOfB,
    databaseId: hidden,
    name: 'Energy nobody else may see',
    notes: 'energy',
  });

  return {
    workspaceId: workspace.id,
    userA: userA.id,
    target,
    byName,
    byField,
  };
};

describe('buildSearchRecordsQuery', () => {
  it('keeps the name-or-fields search inside its own parentheses', () => {
    const compiled = buildSearchRecordsQuery('db', 'ws', 'user', {
      searchQuery: 'energy',
    }).compile();
    const text = compiled.sql.replace(/\s+/g, ' ');

    // Unparenthesised, "… and access and name or fields" let the OR branch
    // escape every other constraint.
    expect(text).toMatch(
      /and \( to_tsvector\('english', coalesce\(n\.attributes->>'name', ''\)\) @@ plainto_tsquery\('english', \$\d+\) or exists \(.*\) \)/
    );
    expect(text).not.toMatch(/join/i);
    expect(text).toMatch(/order by "n"\."id" asc/);
  });
});

describe('searchRecords', () => {
  it('returns each matching record of the database once, and nothing else', async () => {
    const data = await seed();

    const rows = await searchRecords(data.target, data.workspaceId, data.userA, {
      searchQuery: 'energy',
      visibleOnly: true,
    });

    expect(rows.map((row) => row.id)).toEqual(
      [data.byName, data.byField].sort()
    );
  });

  it('matches field values, not the keys of the stored JSON', async () => {
    const data = await seed();

    const rows = await searchRecords(data.target, data.workspaceId, data.userA, {
      searchQuery: 'text',
    });

    expect(rows).toEqual([]);
  });
});

describe('query_database', () => {
  it('pages through the records with a cursor', async () => {
    const data = await seed();
    const ctx = { userId: data.userA, workspaceId: data.workspaceId };

    const first = await queryDatabase(ctx, {
      databaseId: data.target,
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(first.items[1]!.id);

    const second = await queryDatabase(ctx, {
      databaseId: data.target,
      limit: 2,
      cursor: first.nextCursor!,
    });
    // Three visible records: the trashed one is left out.
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('filters within the database only', async () => {
    const data = await seed();
    const ctx = { userId: data.userA, workspaceId: data.workspaceId };

    const result = await queryDatabase(ctx, {
      databaseId: data.target,
      filter: 'energy',
    });

    expect(result.items.map((item) => item.name).sort()).toEqual([
      'Energy budget',
      'Power notes',
    ]);
    expect(result.nextCursor).toBeNull();
  });
});
