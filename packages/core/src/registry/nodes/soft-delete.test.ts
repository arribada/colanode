import { describe, expect, it } from 'vitest';

import {
  isNodeTrashed,
  isSoftDeletableNodeType,
  softDeletableNodeTypes,
} from '@colanode/core/lib/nodes';
import { databaseAttributesSchema } from '@colanode/core/registry/nodes/database';
import { folderAttributesSchema } from '@colanode/core/registry/nodes/folder';
import { pageAttributesSchema } from '@colanode/core/registry/nodes/page';
import { recordAttributesSchema } from '@colanode/core/registry/nodes/record';

describe('soft delete attributes', () => {
  it('page schema accepts and keeps deletedAt/deletedBy', () => {
    const result = pageAttributesSchema.safeParse({
      type: 'page',
      name: 'Page',
      parentId: 'sp1',
      deletedAt: '2026-07-23T10:00:00.000Z',
      deletedBy: 'user1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedAt).toBe('2026-07-23T10:00:00.000Z');
      expect(result.data.deletedBy).toBe('user1');
    }
  });

  it('page schema accepts absence of deletedAt/deletedBy', () => {
    const result = pageAttributesSchema.safeParse({
      type: 'page',
      name: 'Page',
      parentId: 'sp1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedAt).toBeUndefined();
      expect(result.data.deletedBy).toBeUndefined();
    }
  });

  it('folder/database/record schemas accept deletedAt', () => {
    expect(
      folderAttributesSchema.safeParse({
        type: 'folder',
        name: 'Folder',
        parentId: 'sp1',
        deletedAt: '2026-07-23T10:00:00.000Z',
        deletedBy: 'user1',
      }).success
    ).toBe(true);

    expect(
      databaseAttributesSchema.safeParse({
        type: 'database',
        name: 'Database',
        parentId: 'sp1',
        fields: {},
        deletedAt: '2026-07-23T10:00:00.000Z',
        deletedBy: 'user1',
      }).success
    ).toBe(true);

    expect(
      recordAttributesSchema.safeParse({
        type: 'record',
        parentId: 'db1',
        databaseId: 'db1',
        name: 'Record',
        fields: {},
        deletedAt: '2026-07-23T10:00:00.000Z',
        deletedBy: 'user1',
      }).success
    ).toBe(true);
  });

  it('restore clears deletedAt with null', () => {
    const result = pageAttributesSchema.safeParse({
      type: 'page',
      name: 'Page',
      parentId: 'sp1',
      deletedAt: null,
      deletedBy: null,
    });

    expect(result.success).toBe(true);
  });
});

describe('isSoftDeletableNodeType', () => {
  it('content node types are soft deletable', () => {
    for (const type of [
      'page',
      'folder',
      'database',
      'record',
      'file',
      'whiteboard',
    ] as const) {
      expect(isSoftDeletableNodeType(type)).toBe(true);
      expect(softDeletableNodeTypes).toContain(type);
    }
  });

  it('structural/chat node types are not soft deletable', () => {
    for (const type of [
      'space',
      'channel',
      'chat',
      'message',
      'database_view',
    ] as const) {
      expect(isSoftDeletableNodeType(type)).toBe(false);
    }
  });
});

describe('isNodeTrashed', () => {
  it('detects a trashed node by attributes', () => {
    expect(
      isNodeTrashed({
        type: 'page',
        name: 'Page',
        parentId: 'sp1',
        deletedAt: '2026-07-23T10:00:00.000Z',
        deletedBy: 'user1',
      })
    ).toBe(true);
  });

  it('does not flag nodes without deletedAt', () => {
    expect(
      isNodeTrashed({ type: 'page', name: 'Page', parentId: 'sp1' })
    ).toBe(false);
    expect(isNodeTrashed({ deletedAt: null })).toBe(false);
  });
});
