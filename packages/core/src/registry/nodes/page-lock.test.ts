import { describe, expect, it } from 'vitest';

import { Node } from '@colanode/core/registry/nodes';
import { pageModel } from '@colanode/core/registry/nodes/page';

// The lock is decided here and nowhere else: the server calls canUpdateDocument
// before accepting an edit, and the client only mirrors the answer. These
// cases are the whole contract.

type LockMode = 'open' | 'suggest' | 'locked';

const space = (collaborators: Record<string, string>): Node =>
  ({
    id: 'space1',
    type: 'space',
    parentId: null,
    rootId: 'space1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'owner',
    updatedAt: null,
    updatedBy: null,
    name: 'Space',
    collaborators,
  }) as unknown as Node;

const page = (lockMode: LockMode | null, createdBy = 'author'): Node =>
  ({
    id: 'page1',
    type: 'page',
    parentId: 'space1',
    rootId: 'space1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy,
    updatedAt: null,
    updatedBy: null,
    name: 'Page',
    ...(lockMode === null ? {} : { lockMode }),
  }) as unknown as Node;

const canEditDocument = (
  lockMode: LockMode | null,
  userId: string,
  role: string
) =>
  pageModel.canUpdateDocument({
    user: { id: userId, role: 'collaborator' },
    tree: [space({ author: 'editor', admin: 'admin', editor: 'editor', viewer: 'viewer' }), page(lockMode)],
    node: page(lockMode),
  } as never) as boolean;

const canChangeLock = (
  before: LockMode | null,
  after: LockMode,
  userId: string
) =>
  pageModel.canUpdateAttributes({
    user: { id: userId, role: 'collaborator' },
    tree: [space({ author: 'editor', admin: 'admin', editor: 'editor' }), page(before)],
    node: page(before),
    attributes: {
      type: 'page',
      name: 'Page',
      parentId: 'space1',
      lockMode: after,
    },
  } as never) as boolean;

describe('page lock: who may edit the document', () => {
  it('lets any editor write while the page is open', () => {
    expect(canEditDocument('open', 'editor', 'editor')).toBe(true);
    expect(canEditDocument(null, 'editor', 'editor')).toBe(true);
  });

  it('refuses an editor on a locked page', () => {
    expect(canEditDocument('locked', 'editor', 'editor')).toBe(false);
  });

  it('refuses an editor on a page in suggest mode', () => {
    expect(canEditDocument('suggest', 'editor', 'editor')).toBe(false);
  });

  it('still lets the page owner write on a locked page', () => {
    expect(canEditDocument('locked', 'author', 'editor')).toBe(true);
    expect(canEditDocument('suggest', 'author', 'editor')).toBe(true);
  });

  it('still lets a space admin write on a locked page', () => {
    expect(canEditDocument('locked', 'admin', 'admin')).toBe(true);
  });

  it('refuses a viewer whatever the lock', () => {
    expect(canEditDocument('open', 'viewer', 'viewer')).toBe(false);
    expect(canEditDocument('locked', 'viewer', 'viewer')).toBe(false);
  });

  it('refuses somebody with no role in the space at all', () => {
    expect(canEditDocument('open', 'stranger', 'none')).toBe(false);
  });
});

describe('page lock: who may change the lock', () => {
  it('refuses an editor, so the lock cannot be lifted to get around it', () => {
    expect(canChangeLock('locked', 'open', 'editor')).toBe(false);
    expect(canChangeLock('open', 'locked', 'editor')).toBe(false);
  });

  it('allows the page owner', () => {
    expect(canChangeLock('locked', 'open', 'author')).toBe(true);
  });

  it('allows a space admin', () => {
    expect(canChangeLock('locked', 'open', 'admin')).toBe(true);
  });

  it('leaves every other attribute at editor level', () => {
    expect(
      pageModel.canUpdateAttributes({
        user: { id: 'editor', role: 'collaborator' },
        tree: [space({ admin: 'admin', editor: 'editor' }), page('locked')],
        node: page('locked'),
        attributes: {
          type: 'page',
          name: 'Renamed',
          parentId: 'space1',
          lockMode: 'locked',
        },
      } as never)
    ).toBe(true);
  });
});
