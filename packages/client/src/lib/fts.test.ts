import { describe, expect, it } from 'vitest';

import {
  buildFtsExclusionQuery,
  buildFtsMatchQuery,
  buildFtsUnitQueries,
  buildSnippet,
  tokenizeSearchQuery,
} from '@colanode/client/lib/fts';
import { parseSearchQuery } from '@colanode/core';

describe('tokenizeSearchQuery', () => {
  it('splits on whitespace and punctuation', () => {
    expect(tokenizeSearchQuery('hello world')).toEqual(['hello', 'world']);
    expect(tokenizeSearchQuery('  foo,bar.baz!  ')).toEqual([
      'foo',
      'bar',
      'baz',
    ]);
  });

  it('strips double quotes so tokens are safe to embed in FTS5 strings', () => {
    expect(tokenizeSearchQuery('say "hello"')).toEqual(['say', 'hello']);
  });

  it('keeps unicode letters and digits', () => {
    expect(tokenizeSearchQuery('tortue caouanne 42 éléphant')).toEqual([
      'tortue',
      'caouanne',
      '42',
      'éléphant',
    ]);
  });

  it('returns an empty array for empty or symbol-only input', () => {
    expect(tokenizeSearchQuery('')).toEqual([]);
    expect(tokenizeSearchQuery('   ')).toEqual([]);
    expect(tokenizeSearchQuery('!!! ...')).toEqual([]);
  });
});

describe('buildFtsMatchQuery', () => {
  it('builds a prefix match expression for each token', () => {
    expect(buildFtsMatchQuery(['hello', 'wor'])).toBe('"hello"* "wor"*');
  });

  it('returns null when there are no tokens', () => {
    expect(buildFtsMatchQuery([])).toBeNull();
  });

  it('applies a column filter when requested', () => {
    expect(buildFtsMatchQuery(['rec'], 'name')).toBe('name : ("rec"*)');
  });
});

describe('buildFtsUnitQueries', () => {
  it('builds one prefix unit per word and one exact unit per phrase', () => {
    expect(
      buildFtsUnitQueries(parseSearchQuery('tag "sea turtle" -draft'))
    ).toEqual(['"sea turtle"', '"tag"*']);
  });

  it('restricts every unit to a column when asked', () => {
    expect(buildFtsUnitQueries(parseSearchQuery('tag'), 'name')).toEqual([
      'name : ("tag"*)',
    ]);
  });
});

describe('buildFtsExclusionQuery', () => {
  it('joins excluded words with OR, each one whole', () => {
    expect(buildFtsExclusionQuery(parseSearchQuery('a -draft -old'))).toBe(
      '"draft" OR "old"'
    );
    expect(buildFtsExclusionQuery(parseSearchQuery('a'))).toBeNull();
  });
});

describe('buildSnippet', () => {
  it('returns null for missing or empty text', () => {
    expect(buildSnippet(null, ['a'])).toBeNull();
    expect(buildSnippet(undefined, ['a'])).toBeNull();
    expect(buildSnippet('   ', ['a'])).toBeNull();
  });

  it('returns short text as-is', () => {
    expect(buildSnippet('a short note', ['short'])).toBe('a short note');
  });

  it('collapses whitespace and newlines', () => {
    expect(buildSnippet('line one\nline   two', ['two'])).toBe(
      'line one line two'
    );
  });

  it('centers the snippet window on the first match', () => {
    const padding = 'x'.repeat(300);
    const text = `${padding} needle ${padding}`;
    const snippet = buildSnippet(text, ['needle']);

    expect(snippet).toBeDefined();
    expect(snippet).toContain('needle');
    expect(snippet!.startsWith('…')).toBe(true);
    expect(snippet!.endsWith('…')).toBe(true);
    expect(snippet!.length).toBeLessThanOrEqual(152);
  });

  it('matches case-insensitively', () => {
    const snippet = buildSnippet('The QUICK brown fox', ['quick']);
    expect(snippet).toBe('The QUICK brown fox');
  });

  it('falls back to the beginning of the text when no token is found', () => {
    const text = `start ${'y'.repeat(300)}`;
    const snippet = buildSnippet(text, ['missing']);

    expect(snippet).toBeDefined();
    expect(snippet!.startsWith('start')).toBe(true);
    expect(snippet!.endsWith('…')).toBe(true);
  });
});
