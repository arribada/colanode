import { describe, expect, it } from 'vitest';

import {
  compareZ,
  generateKeyBetween,
  generateNKeysBetween,
  keyAfterAll,
  keyBeforeAll,
} from '@colanode/ui/lib/board/fractional-index';

describe('generateKeyBetween', () => {
  it('creates a key after when only a is given', () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);
    expect(b > a).toBe(true);
  });

  it('creates a key before when only b is given', () => {
    const b = generateKeyBetween(null, null);
    const a = generateKeyBetween(null, b);
    expect(a < b).toBe(true);
  });

  it('creates a key strictly between two keys', () => {
    const a = generateKeyBetween(null, null);
    const c = generateKeyBetween(a, null);
    const b = generateKeyBetween(a, c);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('never returns a key ending in the lowest digit', () => {
    let prev: string | null = null;
    for (let i = 0; i < 200; i++) {
      const k = generateKeyBetween(prev, null);
      expect(k.endsWith('0')).toBe(false);
      prev = k;
    }
  });

  it('throws when a is not strictly less than b', () => {
    expect(() => generateKeyBetween('b', 'a')).toThrow();
    expect(() => generateKeyBetween('a', 'a')).toThrow();
  });

  it('keeps ordering under repeated head-insertion (worst case)', () => {
    // Repeatedly insert just before the current minimum.
    const keys: string[] = [];
    let min: string | null = null;
    for (let i = 0; i < 300; i++) {
      const k = generateKeyBetween(null, min);
      keys.unshift(k);
      min = k;
    }
    const sorted = [...keys].sort(compareZ);
    expect(sorted).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps ordering under repeated middle-insertion', () => {
    let lo = generateKeyBetween(null, null);
    let hi = generateKeyBetween(lo, null);
    const all = new Set<string>([lo, hi]);
    for (let i = 0; i < 300; i++) {
      const mid = generateKeyBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      expect(all.has(mid)).toBe(false);
      all.add(mid);
      // alternate which side we keep subdividing
      if (i % 2 === 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
  });
});

describe('generateNKeysBetween', () => {
  it('returns n strictly increasing keys', () => {
    const keys = generateNKeysBetween(null, null, 25);
    expect(keys).toHaveLength(25);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
    expect(new Set(keys).size).toBe(25);
  });

  it('respects the given bounds', () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);
    const keys = generateNKeysBetween(a, b, 10);
    expect(keys.every((k) => k > a && k < b)).toBe(true);
  });

  it('returns an empty array for non-positive n', () => {
    expect(generateNKeysBetween(null, null, 0)).toEqual([]);
    expect(generateNKeysBetween(null, null, -3)).toEqual([]);
  });
});

describe('keyAfterAll / keyBeforeAll', () => {
  it('places a key after / before an existing set', () => {
    const keys = generateNKeysBetween(null, null, 5);
    const after = keyAfterAll(keys);
    const before = keyBeforeAll(keys);
    expect(keys.every((k) => k < after)).toBe(true);
    expect(keys.every((k) => k > before)).toBe(true);
  });

  it('handles the empty set', () => {
    expect(typeof keyAfterAll([])).toBe('string');
    expect(typeof keyBeforeAll([])).toBe('string');
  });
});
