import { describe, expect, it } from 'vitest';

import {
  coverColorPresets,
  coverGradientPresets,
  coverPresets,
  getCoverClass,
} from './covers';

describe('getCoverClass', () => {
  it('returns null when there is no cover', () => {
    expect(getCoverClass(null)).toBeNull();
    expect(getCoverClass(undefined)).toBeNull();
  });

  it('resolves a color preset by type and value', () => {
    expect(getCoverClass({ type: 'color', value: 'blue' })).toBe(
      'bg-blue-400 dark:bg-blue-800'
    );
  });

  it('resolves a gradient preset by type and value', () => {
    expect(getCoverClass({ type: 'gradient', value: 'sunset' })).toBe(
      'bg-gradient-to-r from-orange-300 via-rose-400 to-purple-500'
    );
  });

  it('does not mix up color and gradient namespaces', () => {
    // 'slate' only exists as a gradient; asking for the color falls back.
    expect(getCoverClass({ type: 'color', value: 'slate' })).toBe('bg-muted');
  });

  it('falls back to a muted banner for unknown values', () => {
    expect(getCoverClass({ type: 'gradient', value: 'does-not-exist' })).toBe(
      'bg-muted'
    );
  });
});

describe('cover presets', () => {
  it('have unique keys within each type', () => {
    const keys = coverPresets.map((p) => `${p.cover.type}:${p.cover.value}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declare matching types', () => {
    for (const preset of coverColorPresets) {
      expect(preset.cover.type).toBe('color');
    }
    for (const preset of coverGradientPresets) {
      expect(preset.cover.type).toBe('gradient');
    }
  });
});
