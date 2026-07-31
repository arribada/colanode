import { describe, expect, it } from 'vitest';

import { pageAttributesSchema } from '@colanode/core/registry/nodes/page';

describe('pageAttributesSchema.cover', () => {
  it('accepts a color cover', () => {
    const r = pageAttributesSchema.safeParse({
      type: 'page',
      name: 'Page',
      parentId: 'space1',
      cover: { type: 'color', value: 'blue' },
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cover).toEqual({ type: 'color', value: 'blue' });
    }
  });

  it('accepts a null cover', () => {
    expect(
      pageAttributesSchema.safeParse({
        type: 'page',
        name: 'Page',
        parentId: 'space1',
        cover: null,
      }).success
    ).toBe(true);
  });

  it('accepts absence of cover', () => {
    expect(
      pageAttributesSchema.safeParse({
        type: 'page',
        name: 'Page',
        parentId: 'space1',
      }).success
    ).toBe(true);
  });

  it('rejects an invalid cover type', () => {
    expect(
      pageAttributesSchema.safeParse({
        type: 'page',
        name: 'Page',
        parentId: 'space1',
        cover: { type: 'texture', value: 'blue' },
      }).success
    ).toBe(false);
  });
});
