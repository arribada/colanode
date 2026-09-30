import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import {
  createWhiteboard,
  editWhiteboard,
  getWhiteboard,
  summariseBoardScene,
} from '@colanode/server/lib/ai/tools';
import { createNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const USER = '01ky6s2zq9b8nqpj15wqxtaepdus';
const OTHER = '01ky60b09dk8s769tt484rd3a4us';
const PAGE = '01ky60x9fb8x1856afmmf01sw1pg';
const HIDDEN_PAGE = '01ky60x9vtantb2mwcph9s4e19pg';
const FILE = '01kz6nz23jsk9mv3ws0h6k28vnfi';

const element = (
  id: string,
  type: string,
  z: string,
  extra: Record<string, unknown> = {}
) => ({ id, type, x: 10, y: 20, w: 100, h: 50, z, style: {}, ...extra });

const scene: Record<string, unknown> = {
  s1: element('s1', 'sticky', 'a2', {
    text: 'Second',
    badge: '3',
    groupId: 'g1',
  }),
  s0: element('s0', 'rect', 'a1', {
    text: 'First',
    shape: 'hexagon',
    frameId: 'f1',
  }),
  f1: element('f1', 'frame', 'a0', { text: 'Sprint' }),
  c1: element('c1', 'connector', 'a3', {
    connector: { fromId: 's0', toId: 's1', label: 'then', kind: 'blocks' },
  }),
  c2: element('c2', 'connector', 'a4', {
    connector: {
      fromId: 's1',
      toId: 's0',
      arrowStartType: 'triangle',
      arrowEndType: 'none',
    },
  }),
  card: element('card', 'nodeCard', 'a5', {
    nodeId: PAGE,
    nodeName: 'Old name',
  }),
  lost: element('lost', 'nodeCard', 'a6', {
    nodeId: HIDDEN_PAGE,
    nodeName: 'Stored name',
  }),
  img: element('img', 'image', 'a7', { fileId: FILE }),
  mm: element('mm', 'mindmap', 'a8', {
    text: 'Child idea',
    mindmap: { parentId: 's1' },
  }),
  mine: element('mine', 'sticky', 'a9', { text: 'draft', privateBy: USER }),
  theirs: element('theirs', 'sticky', 'b0', {
    text: 'their draft',
    privateBy: OTHER,
  }),
  hid: element('hid', 'text', 'b1', { text: 'hidden note', hidden: true }),
  newer: element('newer', 'laser', 'b2'),
  junk: 'not an element',
  typeless: { id: 'typeless', z: 'b3', text: 'no type' },
};

const labels = new Map([[PAGE, 'Current name']]);

describe('summariseBoardScene', () => {
  const summary = summariseBoardScene(scene, labels, { userId: USER });

  it('lists elements back to front, connectors and frames apart', () => {
    expect(summary.elements.map((e) => e.id)).toEqual([
      's0',
      's1',
      'card',
      'lost',
      'img',
      'mm',
      'mine',
      'newer',
    ]);
    expect(summary.elementCount).toBe(11);
  });

  it('keeps what an element says, without its geometry by default', () => {
    expect(summary.elements[0]).toEqual({
      id: 's0',
      type: 'rect',
      text: 'First',
      shape: 'hexagon',
      frameId: 'f1',
    });
    expect(summary.elements[1]).toEqual({
      id: 's1',
      type: 'sticky',
      text: 'Second',
      badge: '3',
      groupId: 'g1',
    });
    expect(summary.elements.find((e) => e.id === 'mm')).toEqual({
      id: 'mm',
      type: 'mindmap',
      text: 'Child idea',
      mindmapParentId: 's1',
    });
    expect(summary.elements.find((e) => e.id === 'img')?.image).toEqual({
      fileId: FILE,
    });
    expect(summary.elements.find((e) => e.id === 'newer')).toEqual({
      id: 'newer',
      type: 'laser',
    });
  });

  it('names node cards by their current name, or the stored one when unreadable', () => {
    expect(summary.elements.find((e) => e.id === 'card')?.nodeCard).toEqual({
      nodeId: PAGE,
      name: 'Current name',
      accessible: true,
    });
    expect(summary.elements.find((e) => e.id === 'lost')?.nodeCard).toEqual({
      nodeId: HIDDEN_PAGE,
      name: 'Stored name',
      accessible: false,
    });
  });

  it('reads connector heads the way the canvas draws them', () => {
    expect(summary.connectors).toEqual([
      {
        id: 'c1',
        fromId: 's0',
        toId: 's1',
        label: 'then',
        kind: 'blocks',
        arrowStart: false,
        arrowEnd: true,
      },
      {
        id: 'c2',
        fromId: 's1',
        toId: 's0',
        arrowStart: true,
        arrowEnd: false,
      },
    ]);
  });

  it('lists each frame with the elements inside it', () => {
    expect(summary.frames).toEqual([
      { id: 'f1', text: 'Sprint', childIds: ['s0'] },
    ]);
  });

  it("drops other people's private elements but keeps the caller's own", () => {
    const ids = summary.elements.map((e) => e.id);
    expect(ids).toContain('mine');
    expect(ids).not.toContain('theirs');
  });

  it('shows hidden elements and geometry only when asked', () => {
    const full = summariseBoardScene(scene, labels, {
      userId: USER,
      includeHidden: true,
      includeGeometry: true,
    });
    expect(full.elements.map((e) => e.id)).toContain('hid');
    expect(full.elements.find((e) => e.id === 's0')?.geometry).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    });
  });

  it('survives a scene that is not an object at all', () => {
    expect(summariseBoardScene(null, labels, { userId: USER })).toEqual({
      elementCount: 0,
      elements: [],
      connectors: [],
      frames: [],
    });
  });
});

describe('get_whiteboard', () => {
  it('reads a board, naming only the cards whose page the caller can open', async () => {
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
      name: 'Plan',
    });
    const pageB = await createPageNode({
      workspaceId: workspace.id,
      userId: userB.id,
      parentId: spaceB,
      rootId: spaceB,
      name: 'Bob private plan',
    });

    const board = generateId(IdType.Whiteboard);
    const created = await createNode({
      nodeId: board,
      rootId: spaceA,
      workspaceId: workspace.id,
      userId: userA.id,
      attributes: {
        type: 'whiteboard',
        name: 'Roadmap',
        parentId: spaceA,
        scene: {
          cardA: element('cardA', 'nodeCard', 'a0', {
            nodeId: pageA,
            nodeName: 'Plan (old)',
          }),
          cardB: element('cardB', 'nodeCard', 'a1', {
            nodeId: pageB,
            nodeName: 'Stored on the board',
          }),
        },
      } as NodeAttributes,
    });
    expect(created).toBe(true);

    const ctx = { userId: userA.id, workspaceId: workspace.id };
    const result = await getWhiteboard(ctx, { id: board });

    expect(result).toMatchObject({
      id: board,
      name: 'Roadmap',
      type: 'whiteboard',
    });
    expect(result.elements.map((e) => e.nodeCard)).toEqual([
      { nodeId: pageA, name: 'Plan', accessible: true },
      { nodeId: pageB, name: 'Stored on the board', accessible: false },
    ]);

    await expect(getWhiteboard(ctx, { id: pageA })).rejects.toThrow(/no board/);
  });
});


describe('create_whiteboard + edit_whiteboard', () => {
  const seed = async () => {
    const account = await createAccount({ name: 'Alice' });
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const space = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });
    return { user, workspace, space };
  };

  it('creates a board, adds wired elements, then updates and deletes them', async () => {
    const { user, workspace, space } = await seed();
    const ctx = { userId: user.id, workspaceId: workspace.id };

    const wb = await createWhiteboard(ctx, { parentId: space, name: 'Plan' });
    expect(wb.name).toBe('Plan');

    let board = await getWhiteboard(ctx, { id: wb.id });
    expect(board.type).toBe('whiteboard');
    expect(board.elementCount).toBe(0);

    const edit = await editWhiteboard(ctx, {
      id: wb.id,
      add: [
        { type: 'rect', ref: 'a', x: 0, y: 0, text: 'Start' },
        { type: 'rect', ref: 'b', x: 300, y: 0, text: 'End' },
        {
          type: 'connector',
          x: 0,
          y: 0,
          connector: { fromRef: 'a', toRef: 'b', label: 'then', kind: 'blocks' },
        },
      ],
    });
    expect(edit.added).toHaveLength(3);
    const [a, b] = edit.added;

    board = await getWhiteboard(ctx, { id: wb.id, includeGeometry: true });
    expect(board.elements.map((e) => e.text)).toEqual(['Start', 'End']);
    // default rect size is filled in when omitted
    expect(board.elements[0]?.geometry).toMatchObject({ w: 160, h: 100 });
    expect(board.connectors).toHaveLength(1);
    expect(board.connectors[0]).toMatchObject({
      fromId: a,
      toId: b,
      label: 'then',
      kind: 'blocks',
    });

    await editWhiteboard(ctx, {
      id: wb.id,
      update: [{ id: a!, text: 'Kickoff', x: 50 }],
      delete: [b!],
    });

    board = await getWhiteboard(ctx, { id: wb.id, includeGeometry: true });
    const kept = board.elements.find((e) => e.id === a);
    expect(kept?.text).toBe('Kickoff');
    expect(kept?.geometry?.x).toBe(50);
    expect(board.elements.find((e) => e.id === b)).toBeUndefined();
  });

  it('refuses a connector pointing at an id that is not on the board', async () => {
    const { user, workspace, space } = await seed();
    const ctx = { userId: user.id, workspaceId: workspace.id };
    const wb = await createWhiteboard(ctx, { parentId: space, name: 'Plan' });

    await expect(
      editWhiteboard(ctx, {
        id: wb.id,
        add: [
          {
            type: 'connector',
            x: 0,
            y: 0,
            connector: { fromId: 'nope', toId: 'nope2' },
          },
        ],
      })
    ).rejects.toThrow(/not an element on this board/);
  });

  it('refuses updating an element that is not on the board', async () => {
    const { user, workspace, space } = await seed();
    const ctx = { userId: user.id, workspaceId: workspace.id };
    const wb = await createWhiteboard(ctx, { parentId: space, name: 'Plan' });

    await expect(
      editWhiteboard(ctx, { id: wb.id, update: [{ id: 'ghost', text: 'x' }] })
    ).rejects.toThrow(/not on this board/);
  });

  it('refuses editing a node that has no board', async () => {
    const { user, workspace, space } = await seed();
    const ctx = { userId: user.id, workspaceId: workspace.id };
    await expect(
      editWhiteboard(ctx, { id: space, add: [{ type: 'rect', x: 0, y: 0 }] })
    ).rejects.toThrow(/no board/);
  });

  it('does nothing when given no operations', async () => {
    const { user, workspace, space } = await seed();
    const ctx = { userId: user.id, workspaceId: workspace.id };
    const wb = await createWhiteboard(ctx, { parentId: space, name: 'Plan' });
    await expect(editWhiteboard(ctx, { id: wb.id })).rejects.toThrow(
      /Nothing to do/
    );
  });
});
