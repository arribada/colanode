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

  it('rejects an unknown type', () => {
    expect(
      nodeCoverSchema.safeParse({ type: 'image', value: 'blue' }).success
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
