import { describe, expect, it } from 'vitest';

import { getPage, resolveNodeLabels } from '@colanode/server/lib/ai/tools';
import { createDocument } from '@colanode/server/lib/documents';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

// Two users, each alone in a space of their own.
const seedTwoSpaces = async () => {
  const accountA = await createAccount({ name: 'Alice' });
  const accountB = await createAccount({ name: 'Bob' });
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

  const spaceA = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
  });
  const spaceB = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userB.id,
  });
  const pageA = await createPageNode({
    workspaceId: workspace.id,
    userId: userA.id,
    parentId: spaceA,
    rootId: spaceA,
    name: 'Visible page',
  });
  const pageB = await createPageNode({
    workspaceId: workspace.id,
    userId: userB.id,
    parentId: spaceB,
    rootId: spaceB,
    name: 'Private page of Bob',
  });

  return {
    workspace,
    userA,
    userB,
    spaceA,
    spaceB,
    pageA,
    pageB,
    ctxA: { userId: userA.id, workspaceId: workspace.id },
  };
};

describe('resolveNodeLabels', () => {
  it('names what the caller can read, and nothing else', async () => {
    const data = await seedTwoSpaces();

    const labels = await resolveNodeLabels(data.ctxA, [
      data.pageA,
      data.pageB,
      data.userB.id,
      '01zzzzzzzzzzzzzzzzzzzzzzzzpg',
    ]);

    expect(labels.get(data.pageA)).toBe('Visible page');
    expect(labels.get(data.userB.id)).toBe('@Bob');
    // A page in a space Alice is not in must not leak its name.
    expect(labels.has(data.pageB)).toBe(false);
    expect(labels.size).toBe(2);
  });
});

describe('get_page mentions', () => {
  it('labels mentions with current names, leaving inaccessible ones blank', async () => {
    const data = await seedTwoSpaces();
    const host = await createPageNode({
      workspaceId: data.workspace.id,
      userId: data.userA.id,
      parentId: data.spaceA,
      rootId: data.spaceA,
      name: 'Host',
    });

    await createDocument({
      nodeId: host,
      content: {
        type: 'rich_text',
        blocks: {
          b1: {
            id: 'b1',
            type: 'paragraph',
            parentId: host,
            index: 'a0',
            content: [
              { type: 'mention', attrs: { id: 'm1me', target: data.pageA } },
              { type: 'text', text: ' and ' },
              { type: 'mention', attrs: { id: 'm2me', target: data.pageB } },
            ],
          },
        },
      },
      userId: data.userA.id,
      workspaceId: data.workspace.id,
    });

    const page = await getPage(data.ctxA, { id: host });

    expect(page.content).toBe(
      `[Visible page](node:${data.pageA}) and [](node:${data.pageB})`
    );
  });
});
