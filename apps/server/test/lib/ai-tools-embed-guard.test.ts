import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import { editPage, getPage } from '@colanode/server/lib/ai/tools';
import { createDocument } from '@colanode/server/lib/documents';
import { createNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

// Alice's page shows her own database and one from Bob's private space,
// which she cannot read. `wrongKind` stores Bob's database in a page block.
const seed = async () => {
  const alice = await createAccount({ name: 'Alice' });
  const bob = await createAccount({ name: 'Bob' });
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
  const spaceA = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
  });
  const spaceB = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userB.id,
  });

  const createDatabase = async (
    userId: string,
    spaceId: string,
    name: string
  ): Promise<string> => {
    const id = generateId(IdType.Database);
    const created = await createNode({
      nodeId: id,
      rootId: spaceId,
      attributes: {
        type: 'database',
        name,
        parentId: spaceId,
        fields: {},
      } as NodeAttributes,
      userId,
      workspaceId: workspace.id,
    });
    if (!created) {
      throw new Error('Failed to create database');
    }
    return id;
  };

  const own = await createDatabase(userA.id, spaceA, 'Trackers');
  const foreign = await createDatabase(userB.id, spaceB, 'Bob only');

  // The blocks are parented on the page, so they are built once it exists.
  const hostPage = async (
    name: string,
    blocks: (page: string) => Record<string, unknown>
  ) => {
    const page = await createPageNode({
      workspaceId: workspace.id,
      userId: userA.id,
      parentId: spaceA,
      rootId: spaceA,
      name,
    });
    await createDocument({
      nodeId: page,
      content: { type: 'rich_text', blocks: blocks(page) as never },
      userId: userA.id,
      workspaceId: workspace.id,
    });
    return page;
  };

  const host = await hostPage('Host', (page) => ({
    [own]: {
      id: own,
      type: 'database',
      parentId: page,
      index: 'a0',
      attrs: { inline: true },
    },
    [foreign]: {
      id: foreign,
      type: 'database',
      parentId: page,
      index: 'a1',
      attrs: { inline: true },
    },
  }));
  const wrongKind = await hostPage('Wrong kind', (page) => ({
    [foreign]: { id: foreign, type: 'page', parentId: page, index: 'a0' },
  }));

  return {
    ctx: { userId: userA.id, workspaceId: workspace.id },
    own,
    foreign,
    host,
    wrongKind,
  };
};

// The markdown of a page with the JSON of one embedded node's fence, and
// optionally its fence line, rewritten.
const rewriteEmbed = (
  content: string,
  id: string,
  change: (json: Record<string, unknown>) => Record<string, unknown>,
  fence?: string
): string => {
  const lines = content.split('\n');
  const at = lines.findIndex(
    (line) => line.startsWith('{') && line.includes(`"${id}"`)
  );
  expect(at).toBeGreaterThan(0);
  lines[at] = JSON.stringify(change(JSON.parse(lines[at]!)));
  if (fence) {
    lines[at - 1] = fence;
  }
  return lines.join('\n');
};

describe('embeds a replace edit keeps, changes or re-types', () => {
  it('keeps an embed the caller cannot read exactly as it was', async () => {
    const data = await seed();
    const page = await getPage(data.ctx, { id: data.host });

    await editPage(data.ctx, {
      id: data.host,
      mode: 'replace',
      content: `${page.content}\n\nOne more line.`,
    });
    const after = await getPage(data.ctx, { id: data.host });
    expect(after.content).toContain(
      JSON.stringify({ id: data.foreign, inline: true })
    );
  });

  it('lets the caller change an embed it can read', async () => {
    const data = await seed();
    const page = await getPage(data.ctx, { id: data.host });
    await editPage(data.ctx, {
      id: data.host,
      mode: 'replace',
      content: rewriteEmbed(page.content, data.own, (json) => ({
        ...json,
        inline: false,
      })),
    });
    expect((await getPage(data.ctx, { id: data.host })).content).toContain(
      `"id":"${data.own}","inline":false`
    );
  });

  it('refuses to change the settings of an embed the caller cannot read', async () => {
    const data = await seed();
    const page = await getPage(data.ctx, { id: data.host });

    await expect(
      editPage(data.ctx, {
        id: data.host,
        mode: 'replace',
        content: rewriteEmbed(page.content, data.foreign, (json) => ({
          ...json,
          inline: false,
        })),
      })
    ).rejects.toThrow(/do not have access/);
    expect((await getPage(data.ctx, { id: data.host })).content).toBe(
      page.content
    );
  });

  it('refuses to turn an embed the caller cannot read into another kind of block', async () => {
    const data = await seed();
    const page = await getPage(data.ctx, { id: data.host });

    await expect(
      editPage(data.ctx, {
        id: data.host,
        mode: 'replace',
        content: rewriteEmbed(
          page.content,
          data.foreign,
          (json) => ({ id: json.id }),
          '```colanode-page'
        ),
      })
    ).rejects.toThrow(/do not have access/);
  });

  it('refuses a stored block that shows the wrong kind of node, even unchanged', async () => {
    const data = await seed();
    const page = await getPage(data.ctx, { id: data.wrongKind });

    await expect(
      editPage(data.ctx, {
        id: data.wrongKind,
        mode: 'replace',
        content: `${page.content}\n\nOne more line.`,
      })
    ).rejects.toThrow(/cannot be shown by a page block/);
  });
});
