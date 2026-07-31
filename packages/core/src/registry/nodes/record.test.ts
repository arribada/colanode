import { describe, expect, it } from 'vitest';

import { recordAttributesSchema } from '@colanode/core/registry/nodes/record';

describe('recordAttributesSchema.sourceMessageId', () => {
  it('accepts sourceMessageId', () => {
    const r = recordAttributesSchema.safeParse({
      type: 'record',
      parentId: 'db1',
      databaseId: 'db1',
      name: 'Record',
      fields: {},
      sourceMessageId: 'msg1',
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sourceMessageId).toBe('msg1');
    }
  });

  it('accepts absence of sourceMessageId', () => {
    expect(
      recordAttributesSchema.safeParse({
        type: 'record',
        parentId: 'db1',
        databaseId: 'db1',
        name: 'Record',
        fields: {},
      }).success
    ).toBe(true);
  });
});

describe('recordAttributesSchema.cover', () => {
  it('accepts a cover object', () => {
    const r = recordAttributesSchema.safeParse({
      type: 'record',
      parentId: 'db1',
      databaseId: 'db1',
      name: 'Record',
      fields: {},
      cover: { type: 'gradient', value: 'ocean' },
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cover).toEqual({ type: 'gradient', value: 'ocean' });
    }
  });

  it('accepts a null cover', () => {
    expect(
      recordAttributesSchema.safeParse({
        type: 'record',
        parentId: 'db1',
        databaseId: 'db1',
        name: 'Record',
        fields: {},
        cover: null,
      }).success
    ).toBe(true);
  });

  it('accepts absence of cover', () => {
    expect(
      recordAttributesSchema.safeParse({
        type: 'record',
        parentId: 'db1',
        databaseId: 'db1',
        name: 'Record',
        fields: {},
      }).success
    ).toBe(true);
  });

  it('rejects a malformed cover', () => {
    expect(
      recordAttributesSchema.safeParse({
        type: 'record',
        parentId: 'db1',
        databaseId: 'db1',
        name: 'Record',
        fields: {},
        cover: { type: 'color' },
      }).success
    ).toBe(false);
  });
});
