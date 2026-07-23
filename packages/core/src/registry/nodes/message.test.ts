import { describe, expect, it } from 'vitest';

import { Node } from '@colanode/core/registry/nodes';
import {
  messageAttributesSchema,
  messageModel,
} from '@colanode/core/registry/nodes/message';

const user = { id: 'user1', role: 'admin' } as never;

const makeNode = (id: string, type: string, parentId: string | null): Node =>
  ({
    id,
    type,
    parentId,
    rootId: 'space1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'user1',
    updatedAt: null,
    updatedBy: null,
    name: type,
    ...(type === 'space' ? { collaborators: { user1: 'admin' } } : {}),
  }) as unknown as Node;

const space = makeNode('space1', 'space', null);
const page = makeNode('page1', 'page', 'space1');
const channel = makeNode('chan1', 'channel', 'space1');
const rootMessage = makeNode('msg1', 'message', 'chan1');
const threadReply = makeNode('msg2', 'message', 'msg1');

const attrs = { type: 'message', subtype: 'standard', parentId: '' } as never;

describe('messageModel.canCreate thread depth', () => {
  it('allows message under channel', () => {
    expect(
      messageModel.canCreate({ user, tree: [space, channel], attributes: attrs } as never)
    ).toBe(true);
  });

  it('allows reply under a root message (1-level thread)', () => {
    expect(
      messageModel.canCreate({
        user,
        tree: [space, channel, rootMessage],
        attributes: attrs,
      } as never)
    ).toBe(true);
  });

  it('rejects reply under a thread reply (no nested threads)', () => {
    expect(
      messageModel.canCreate({
        user,
        tree: [space, channel, rootMessage, threadReply],
        attributes: attrs,
      } as never)
    ).toBe(false);
  });
});

describe('messageAttributesSchema.taskId', () => {
  it('accepts taskId', () => {
    const r = messageAttributesSchema.safeParse({
      type: 'message',
      subtype: 'standard',
      parentId: 'chan1',
      taskId: 'rec1',
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.taskId).toBe('rec1');
    }
  });

  it('accepts absence of taskId', () => {
    expect(
      messageAttributesSchema.safeParse({
        type: 'message',
        subtype: 'standard',
        parentId: 'chan1',
      }).success
    ).toBe(true);
  });
});

describe('messageModel.canCreate page comments', () => {
  it('allows message under a page (page comments)', () => {
    expect(
      messageModel.canCreate({
        user,
        tree: [space, page],
        attributes: attrs,
      } as never)
    ).toBe(true);
  });

  it('allows reply under a page comment (1-level thread)', () => {
    const comment = makeNode('cmsg1', 'message', 'page1');
    expect(
      messageModel.canCreate({
        user,
        tree: [space, page, comment],
        attributes: attrs,
      } as never)
    ).toBe(true);
  });
});
