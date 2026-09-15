import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes, NodeRole } from '@colanode/core';
import { listDatabases, queryDatabase } from '@colanode/server/lib/ai/tools';
import { createNode } from '@colanode/server/lib/nodes';
import { fetchAllRecords, searchRecords } from '@colanode/server/lib/records';

import {
  createAccount,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const NOTES_FIELD = 'notesfield';

// A space only Alice is in, holding a database she shared with Bob directly
// and one she did not share. Carol has a space of her own, so she has
// collaborations -- none of which reaches Alice's databases.
const seed = async () => {
  const alice = await createAccount({ name: 'Alice' });
  const bob = await createAccount({ name: 'Bob' });
  const carol = await createAccount({ name: 'Carol' });
  const workspace = await createWorkspace({ createdBy: alice.id });
  const userA = await createUser({
    workspaceId: workspace.id,
    account: alice,
    role: 'owner',
  });
  const userB = await createUser({
    workspaceId: workspace.id,
    account: bob,
    role: 'collaborator',
  });
  const userC = await createUser({
    workspaceId: workspace.id,
    account: carol,
    role: 'collaborator',
  });
  const space = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
    name: 'Alice only',
  });
  await createSpaceNode({
    workspaceId: workspace.id,
    userId: userC.id,
    name: 'Carol only',
  });

  const createDatabase = async (
    name: string,
    collaborators?: Record<string, NodeRole>
  ): Promise<string> => {
    const id = generateId(IdType.Database);
    const attributes: NodeAttributes = {
      type: 'database',
      name,
      parentId: space,
      fields: {
        [NOTES_FIELD]: {
          id: NOTES_FIELD,
          type: 'text',
          name: 'Notes',
          index: 'a0',
        },
      },
      ...(collaborators ? { collaborators } : {}),
    };
    const created = await createNode({
      nodeId: id,
      rootId: space,
      attributes,
      userId: userA.id,
      workspaceId: workspace.id,
    });
    if (!created) {
      throw new Error('Failed to create database');
    }
    return id;
  };

  const createRecord = async (
    databaseId: string,
    name: string,
    notes: string
  ): Promise<string> => {
    const id = generateId(IdType.Record);
    const created = await createNode({
      nodeId: id,
      rootId: space,
      attributes: {
        type: 'record',
        parentId: databaseId,
        databaseId,
        name,
        fields: { [NOTES_FIELD]: { type: 'text', value: notes } },
      },
      userId: userA.id,
      workspaceId: workspace.id,
    });
    if (!created) {
      throw new Error('Failed to create record');
    }
    return id;
  };

  const shared = await createDatabase('Shared with Bob', {
    [userB.id]: 'viewer',
  });
  const unshared = await createDatabase('Not shared');
  const budget = await createRecord(
    shared,
    'Energy budget',
    'solar harvesting'
  );
  const antenna = await createRecord(shared, 'Antenna', 'ground plane');
  await createRecord(unshared, 'Hidden', 'solar');

  return {
    workspaceId: workspace.id,
    userC: userC.id,
    ctxB: { userId: userB.id, workspaceId: workspace.id },
    ctxC: { userId: userC.id, workspaceId: workspace.id },
    shared,
    budget,
    antenna,
  };
};

describe('a database shared directly with someone outside its space', () => {
  it('returns its records to them through query_database, filtered or not', async () => {
    const data = await seed();

    const all = await queryDatabase(data.ctxB, { databaseId: data.shared });
    expect(all.items.map((item) => item.id).sort()).toEqual(
      [data.budget, data.antenna].sort()
    );

    const filtered = await queryDatabase(data.ctxB, {
      databaseId: data.shared,
      filter: 'solar',
    });
    expect(filtered.items.map((item) => item.id)).toEqual([data.budget]);
  });

  it('lists it in list_databases, and not the database beside it', async () => {
    const data = await seed();
    const listed = await listDatabases(data.ctxB, {});
    expect(listed.map((db) => db.id)).toEqual([data.shared]);
    expect(listed[0]!.fields.map((field) => field.name)).toEqual(['Notes']);
  });

  it('still shows nothing to someone it was not shared with', async () => {
    const data = await seed();
    expect(await listDatabases(data.ctxC, {})).toEqual([]);
    await expect(
      queryDatabase(data.ctxC, { databaseId: data.shared })
    ).rejects.toThrow(/do not have access/);
  });

  it('keeps the record queries themselves to what the user can open', async () => {
    // records.ts also serves the client's database views, without the tool's
    // node check in front: a collaboration somewhere else must not reach in.
    const data = await seed();
    expect(
      await fetchAllRecords(data.shared, data.workspaceId, data.userC)
    ).toEqual([]);
    expect(
      await searchRecords(data.shared, data.workspaceId, data.userC, {
        searchQuery: 'solar',
      })
    ).toEqual([]);
  });
});
