import { describe, expect, it } from 'vitest';

import { emojiFromUnified } from '@colanode/ui/lib/board/emoji';

describe('emojiFromUnified', () => {
  it('decodes a plain emoji', () => {
    expect(emojiFromUnified('1f600')).toBe('\u{1f600}');
  });

  it('keeps every codepoint of a joined sequence', () => {
    // Taking only the first would turn a family into a lone man.
    const family = emojiFromUnified('1f468-200d-1f469-200d-1f466');
    expect(family).toBe('\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f466}');
  });

  it('keeps a skin-tone modifier', () => {
    expect(emojiFromUnified('1f44d-1f3fd')).toBe('\u{1f44d}\u{1f3fd}');
  });

  it('returns empty for nonsense rather than throwing', () => {
    expect(emojiFromUnified('')).toBe('');
    expect(emojiFromUnified('zzz')).toBe('');
  });

  it('drops a codepoint outside the Unicode range instead of throwing', () => {
    // String.fromCodePoint throws a RangeError on these, which would take the
    // whole board render down.
    expect(emojiFromUnified('ffffffff')).toBe('');
  });
});
