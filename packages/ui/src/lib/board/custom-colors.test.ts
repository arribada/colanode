import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readCustomColors,
  rememberCustomColor,
} from '@colanode/ui/lib/board/custom-colors';

const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

describe('custom colours', () => {
  beforeEach(() => store.clear());

  it('starts empty', () => {
    expect(readCustomColors()).toEqual([]);
  });

  it('keeps the most recent first', () => {
    rememberCustomColor('#111111');
    rememberCustomColor('#222222');
    expect(readCustomColors()).toEqual(['#222222', '#111111']);
  });

  it('moves a repeat to the front instead of duplicating it', () => {
    rememberCustomColor('#111111');
    rememberCustomColor('#222222');
    rememberCustomColor('#111111');
    expect(readCustomColors()).toEqual(['#111111', '#222222']);
  });

  it('caps the palette at eight', () => {
    for (let i = 0; i < 12; i++) {
      rememberCustomColor(`#${i.toString(16).repeat(6).slice(0, 6)}`);
    }
    expect(readCustomColors()).toHaveLength(8);
  });

  it('refuses anything that is not a hex colour', () => {
    // This value ends up in a `fill` attribute on the board, and localStorage
    // is shared with everything else on the origin.
    rememberCustomColor('red');
    rememberCustomColor('javascript:alert(1)');
    expect(readCustomColors()).toEqual([]);
  });

  it('survives corrupted storage', () => {
    store.set('colanode.board.customColors', 'not json');
    expect(readCustomColors()).toEqual([]);
    store.set('colanode.board.customColors', '{"nope":true}');
    expect(readCustomColors()).toEqual([]);
    store.set('colanode.board.customColors', '["#abcdef", 42, "red"]');
    expect(readCustomColors()).toEqual(['#abcdef']);
  });
});
