import { describe, expect, it } from 'vitest';

import {
  generateFractionalIndex,
  generateId,
  IdType,
  NodeAttributes,
} from '@colanode/core';
import {
  editPage,
  getPage,
  listChildren,
  resolveNodeLabels,
} from '@colanode/server/lib/ai/tools';
import { createDocument } from '@colanode/server/lib/documents';
import { createNode, updateNode } from '@colanode/server/lib/nodes';

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

const FIELD = 'projectfield';
const OPTION = 'insightoption';

const createDatabaseIn = async (input: {
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
      [FIELD]: {
        id: FIELD,
        type: 'select',
        name: 'Project',
        index: 'a0',
        options: {
          [OPTION]: { id: OPTION, name: 'Insight', color: 'blue', index: 'a0' },
        },
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

describe('embedded blocks through get_page and edit_page', () => {
  const seedHost = async () => {
    const data = await seedTwoSpaces();
    const ownDatabase = await createDatabaseIn({
      workspaceId: data.workspace.id,
      userId: data.userA.id,
      spaceId: data.spaceA,
      name: 'Trackers',
    });
    const foreignDatabase = await createDatabaseIn({
      workspaceId: data.workspace.id,
      userId: data.userB.id,
      spaceId: data.spaceB,
      name: 'Bob only',
    });
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
          [ownDatabase]: {
            id: ownDatabase,
            type: 'database',
            parentId: host,
            index: 'a0',
            attrs: { inline: true, filterFieldId: FIELD, filterValue: OPTION },
          },
          [foreignDatabase]: {
            id: foreignDatabase,
            type: 'database',
            parentId: host,
            index: 'a1',
            attrs: { inline: true },
          },
        },
      },
      userId: data.userA.id,
      workspaceId: data.workspace.id,
    });
    return { ...data, ownDatabase, foreignDatabase, host };
  };

  const fencesOf = (content: string) =>
    content
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it('names the views the caller can read and spells out their filter', async () => {
    const data = await seedHost();

    const page = await getPage(data.ctxA, { id: data.host });
    const [own, foreign] = fencesOf(page.content);

    expect(own).toEqual({
      id: data.ownDatabase,
      inline: true,
      filterFieldId: FIELD,
      filterValue: OPTION,
      _name: 'Trackers',
      _filter: 'Project = Insight',
    });
    // Kept, so a rewrite does not delete it, but not named.
    expect(foreign).toEqual({ id: data.foreignDatabase, inline: true });
  });

  it('keeps what the page already embeds through a replace, but refuses to add what the caller cannot read', async () => {
    const data = await seedHost();
    const page = await getPage(data.ctxA, { id: data.host });

    await editPage(data.ctxA, {
      id: data.host,
      mode: 'replace',
      content: `${page.content}\n\nOne more line.`,
    });
    const after = await getPage(data.ctxA, { id: data.host });
    expect(fencesOf(after.content).map((fence) => fence.id)).toEqual([
      data.ownDatabase,
      data.foreignDatabase,
    ]);

    const foreignPage =
      '```colanode-page\n' + JSON.stringify({ id: data.pageB }) + '\n```';
    await expect(
      editPage(data.ctxA, {
        id: data.host,
        mode: 'append',
        content: foreignPage,
      })
    ).rejects.toThrow(/do not have access/);
  });

  it('refuses a block that would draw the wrong kind of node', async () => {
    const data = await seedHost();

    const pageAsDatabase =
      '```colanode-database\n' + JSON.stringify({ id: data.pageA }) + '\n```';
    await expect(
      editPage(data.ctxA, {
        id: data.host,
        mode: 'append',
        content: pageAsDatabase,
      })
    ).rejects.toThrow(/is a page/);
  });
});

describe('list_children and where a page sits', () => {
  it('lists children in sidebar order, leaving out trash and templates', async () => {
    const data = await seedTwoSpaces();
    const ctx = data.ctxA;
    const base = {
      workspaceId: data.workspace.id,
      userId: data.userA.id,
      rootId: data.spaceA,
      parentId: data.spaceA,
    };
    const second = await createPageNode({ ...base, name: 'Second' });
    const third = await createPageNode({ ...base, name: 'Third' });
    const trashed = await createPageNode({ ...base, name: 'Trashed' });
    await createPageNode({ ...base, parentId: second, name: 'Grandchild' });

    const template = generateId(IdType.Page);
    await createNode({
      nodeId: template,
      rootId: data.spaceA,
      workspaceId: data.workspace.id,
      userId: data.userA.id,
      attributes: {
        type: 'page',
        name: 'Template',
        parentId: data.spaceA,
        isTemplate: true,
      },
    });
    await updateNode({
      nodeId: trashed,
      userId: data.userA.id,
      workspaceId: data.workspace.id,
      updater: (attributes) => ({
        ...attributes,
        deletedAt: new Date().toISOString(),
        deletedBy: data.userA.id,
      }),
    });
    // Dragged above everything else, as the sidebar writes it.
    await updateNode({
      nodeId: third,
      userId: data.userA.id,
      workspaceId: data.workspace.id,
      updater: (attributes) => ({
        ...attributes,
        index: generateFractionalIndex(
          null,
          generateFractionalIndex(null, null)
        ),
      }),
    });

    const listed = await listChildren(ctx, { nodeId: data.spaceA });
    expect(listed.parent).toEqual({
      id: data.spaceA,
      type: 'space',
      name: 'Test Space',
    });
    expect(listed.items.map((item) => item.id)).toEqual([
      third,
      ...[data.pageA, second].sort(),
    ]);
    expect(listed.total).toBe(3);
    expect(listed.items.find((item) => item.id === second)?.hasChildren).toBe(
      true
    );
    expect(listed.items.find((item) => item.id === third)?.hasChildren).toBe(
      false
    );

    const firstPage = await listChildren(ctx, {
      nodeId: data.spaceA,
      limit: 2,
    });
    expect(firstPage.nextCursor).toBe(firstPage.items[1]!.id);
    const rest = await listChildren(ctx, {
      nodeId: data.spaceA,
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(rest.items.map((item) => item.id)).toEqual(
      listed.items.slice(2).map((item) => item.id)
    );
    expect(rest.nextCursor).toBeNull();

    const folders = await listChildren(ctx, {
      nodeId: data.spaceA,
      types: ['folder'],
    });
    expect(folders.total).toBe(0);
  });

  it('lists the spaces the caller can open when no node is given', async () => {
    const data = await seedTwoSpaces();

    const spaces = await listChildren(data.ctxA, {});

    expect(spaces.parent).toBeNull();
    expect(spaces.items.map((item) => item.id)).toEqual([data.spaceA]);
  });

  it('tells get_page where a page sits and what is under it', async () => {
    const data = await seedTwoSpaces();
    const child = await createPageNode({
      workspaceId: data.workspace.id,
      userId: data.userA.id,
      rootId: data.spaceA,
      parentId: data.pageA,
      name: 'Child',
    });

    const page = await getPage(data.ctxA, { id: child });
    expect(page.parentId).toBe(data.pageA);
    expect(page.rootId).toBe(data.spaceA);
    expect(page.path).toEqual([
      { id: data.spaceA, type: 'space', name: 'Test Space' },
      { id: data.pageA, type: 'page', name: 'Visible page' },
    ]);
    expect(page.childCounts).toEqual({});

    const parent = await getPage(data.ctxA, { id: data.pageA });
    expect(parent.childCounts).toEqual({ page: 1 });
  });
});
