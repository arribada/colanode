import { describe, expect, it } from 'vitest';

import { nodeCoverSchema } from '@colanode/core/registry/nodes/core';

describe('nodeCoverSchema', () => {
  it('accepts a color cover', () => {
    const r = nodeCoverSchema.safeParse({ type: 'color', value: 'blue' });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ type: 'color', value: 'blue' });
    }
  });

  it('accepts a gradient cover', () => {
    const r = nodeCoverSchema.safeParse({ type: 'gradient', value: 'sunset' });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ type: 'gradient', value: 'sunset' });
    }
  });

  it('accepts an image cover', () => {
    const r = nodeCoverSchema.safeParse({
      type: 'image',
      value: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e',
    });

    expect(r.success).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(
      nodeCoverSchema.safeParse({ type: 'video', value: 'x' }).success
    ).toBe(false);
  });

  it('rejects a missing value', () => {
    expect(nodeCoverSchema.safeParse({ type: 'color' }).success).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(
      nodeCoverSchema.safeParse({ type: 'color', value: 42 }).success
    ).toBe(false);
  });
});
