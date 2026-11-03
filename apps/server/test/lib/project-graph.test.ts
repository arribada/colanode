import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import { createNode } from '@colanode/server/lib/nodes';
import { buildProjectGraphForPage } from '@colanode/server/lib/projects/graph';

import {
  createAccount,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

// A project page declaring its requirements register, one requirement page,
// and a Requirements database holding two MARLIN requirements and one of
// another project. A second database, private to Ann, holds the tests.
const seed = async () => {
  const ann = await createAccount({ name: 'Ann' });
  const bob = await createAccount({ name: 'Bob' });
  const workspace = await createWorkspace({ createdBy: ann.id });
  const userA = await createUser({
    workspaceId: workspace.id,
    account: ann,
    role: 'owner',
  });
  const userB = await createUser({
    workspaceId: workspace.id,
    account: bob,
    role: 'collaborator',
  });
  const space = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
    name: 'Projects',
    collaborators: { [userB.id]: 'editor' },
  });
  // Ann's own space: what is in it, Bob cannot read.
  const privateSpace = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
    name: 'Ann only',
  });

  const node = async (
    attributes: NodeAttributes,
    id = generateId(IdType.Page),
    rootId = space
  ) => {
    const created = await createNode({
      nodeId: id,
      rootId,
      attributes,
      userId: userA.id,
      workspaceId: workspace.id,
    });
    if (!created) throw new Error('seed failed');
    return id;
  };

  const reqDb = generateId(IdType.Database);
  const testDb = generateId(IdType.Database);
  await node(
    {
      type: 'database',
      name: 'Requirements',
      parentId: space,
      fields: {
        fproj: {
          id: 'fproj',
          type: 'select',
          name: 'Project',
          index: 'a0',
          options: {
            omarlin: {
              id: 'omarlin',
              name: 'MARLIN',
              color: 'blue',
              index: 'a0',
            },
            oother: { id: 'oother', name: 'OTHER', color: 'gray', index: 'a1' },
          },
        },
        fverby: {
          id: 'fverby',
          type: 'relation',
          name: 'Verified by',
          index: 'a1',
          databaseId: testDb,
        },
      },
    },
    reqDb
  );
  await node(
    {
      type: 'database',
      name: 'Verification',
      parentId: privateSpace,
      fields: {
        fproj: {
          id: 'fproj',
          type: 'select',
          name: 'Project',
          index: 'a0',
          options: {
            vmarlin: {
              id: 'vmarlin',
              name: 'MARLIN',
              color: 'blue',
              index: 'a0',
            },
          },
        },
      },
    } as NodeAttributes,
    testDb,
    privateSpace
  );

  const root = await node({
    type: 'page',
    name: 'MARLIN',
    parentId: space,
    projectCode: 'MARLIN',
    projectRegisters: {
      requirements: {
        databaseId: reqDb,
        fieldId: 'fproj',
        optionId: 'omarlin',
      },
      tests: { databaseId: testDb, fieldId: 'fproj', optionId: 'vmarlin' },
    },
  });
  const reqPage = await node({
    type: 'page',
    name: 'Requirements',
    parentId: root,
    projectRole: 'requirements',
  });
  const testPage = await node({
    type: 'page',
    name: 'Tests and validation',
    parentId: root,
    projectRole: 'tests',
  });

  const record = (
    databaseId: string,
    name: string,
    fields: Record<string, unknown>,
    rootId = space
  ) =>
    node(
      {
        type: 'record',
        parentId: databaseId,
        databaseId,
        name,
        fields,
      } as NodeAttributes,
      generateId(IdType.Record),
      rootId
    );
  const t1 = await record(
    testDb,
    'PT-1',
    { fproj: { type: 'string', value: 'vmarlin' } },
    privateSpace
  );
  const hw1 = await record(reqDb, 'HW-1', {
    fproj: { type: 'string', value: 'omarlin' },
    fverby: { type: 'string_array', value: [t1] },
  });
  const hw2 = await record(reqDb, 'HW-2', {
    fproj: { type: 'string', value: 'omarlin' },
  });
  const foreign = await record(reqDb, 'X-1', {
    fproj: { type: 'string', value: 'oother' },
  });

  return {
    ann: { userId: userA.id, workspaceId: workspace.id },
    bob: { userId: userB.id, workspaceId: workspace.id },
    root,
    reqPage,
    testPage,
    hw1,
    hw2,
    foreign,
    t1,
  };
};

describe('buildProjectGraphForPage', () => {
  it('draws the project pages and only this project records, from any page of it', async () => {
    const s = await seed();
    const graph = await buildProjectGraphForPage(s.ann, s.reqPage);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(ids.has(s.hw1)).toBe(true);
    expect(ids.has(s.hw2)).toBe(true);
    expect(ids.has(s.t1)).toBe(true);
    expect(ids.has(s.foreign)).toBe(false);
    expect(graph.lanes[s.hw1]).toBe('requirements');
    expect(graph.lanes[s.t1]).toBe('verification');
    expect(graph.project?.code).toBe('MARLIN');
    expect(graph.project?.coverage).toMatchObject({
      requirements: 2,
      tested: 1,
      tests: 1,
    });
  });

  it('leaves out a register the caller cannot read', async () => {
    const s = await seed();
    const graph = await buildProjectGraphForPage(s.bob, s.root);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(ids.has(s.hw1)).toBe(true);
    expect(ids.has(s.t1)).toBe(false);
    expect(graph.project?.coverage.tests).toBe(0);
  });

  it('returns an empty graph for a page outside any project', async () => {
    const s = await seed();
    const graph = await buildProjectGraphForPage(s.ann, s.hw1);
    expect(graph.project).toBeNull();
    expect(graph.nodes).toEqual([]);
  });
});
