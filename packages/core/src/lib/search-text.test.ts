import { describe, expect, it } from 'vitest';

import {
  buildSearchExcerpt,
  countWords,
  findSearchMatches,
  findSubstringMatches,
  hasSearchTerms,
  parseSearchQuery,
} from './search-text';

const marked = (text: string, ranges: { start: number; end: number }[]) =>
  ranges.map((range) => text.slice(range.start, range.end));

describe('parseSearchQuery', () => {
  it('reads words, quoted phrases and excluded words', () => {
    expect(parseSearchQuery('turtle "nesting site" -draft')).toEqual({
      terms: ['turtle'],
      phrases: [['nesting', 'site']],
      excluded: ['draft'],
    });
  });

  it('folds case and accents and drops repeated words', () => {
    expect(parseSearchQuery('Éclosion eclosion ÉCRAN').terms).toEqual([
      'eclosion',
      'ecran',
    ]);
  });

  it('keeps the words as typed when asked not to fold them', () => {
    expect(parseSearchQuery('Écran "Sea Turtle"', { fold: false })).toEqual({
      terms: ['Écran'],
      phrases: [['Sea', 'Turtle']],
      excluded: [],
    });
  });

  it('reads an unclosed quote as plain words', () => {
    expect(parseSearchQuery('"sea turtle')).toEqual({
      terms: ['sea', 'turtle'],
      phrases: [],
      excluded: [],
    });
  });

  it('keeps a hyphen inside a word as a separator, not an exclusion', () => {
    expect(parseSearchQuery('co-op -')).toEqual({
      terms: ['co', 'op'],
      phrases: [],
      excluded: [],
    });
  });

  it('has nothing to look for when every word is excluded', () => {
    expect(hasSearchTerms(parseSearchQuery('-draft'))).toBe(false);
    expect(hasSearchTerms(parseSearchQuery('"x"'))).toBe(true);
  });
});

describe('findSearchMatches', () => {
  it('matches words that start with a term, whatever the case and accents', () => {
    const text = 'Les Tortues et la tortue; une détortue? Écran.';
    const ranges = findSearchMatches(text, parseSearchQuery('tortu ecran'));
    expect(marked(text, ranges)).toEqual(['Tortu', 'tortu', 'Écran']);
  });

  it('marks the longest term at a position', () => {
    const text = 'tortue';
    const ranges = findSearchMatches(text, parseSearchQuery('tort tortue'));
    expect(marked(text, ranges)).toEqual(['tortue']);
  });

  it('matches a phrase only as whole words side by side', () => {
    const text = 'sea turtle, sea-turtle, sea turtles, sea and turtle';
    const ranges = findSearchMatches(text, parseSearchQuery('"sea turtle"'));
    expect(marked(text, ranges)).toEqual(['sea turtle', 'sea-turtle']);
  });

  it('maps matches back through decomposed accents', () => {
    const text = 'Le premier écran, puis l’écran';
    const ranges = findSearchMatches(text, parseSearchQuery('ecran'));
    expect(marked(text, ranges)).toEqual(['écran', 'écran']);
  });

  it('stops at the limit', () => {
    expect(
      findSearchMatches('tag tag tag tag', parseSearchQuery('tag'), 2)
    ).toHaveLength(2);
  });
});

describe('findSubstringMatches', () => {
  it('finds a needle anywhere, ignoring case and accents', () => {
    const text = 'Écran, ecran, préécran';
    expect(marked(text, findSubstringMatches(text, 'ecran'))).toEqual([
      'Écran',
      'ecran',
      'écran',
    ]);
  });

  it('respects case and accents when asked to', () => {
    const text = 'Écran, ecran, Ecran';
    expect(
      marked(text, findSubstringMatches(text, 'Ecran', { matchCase: true }))
    ).toEqual(['Ecran']);
  });

  it('keeps whole words only when asked to', () => {
    const text = 'tag tags stag tag.';
    expect(
      findSubstringMatches(text, 'tag', { wholeWord: true }).map(
        (range) => range.start
      )
    ).toEqual([0, 14]);
  });

  it('does not overlap matches', () => {
    expect(findSubstringMatches('aaaa', 'aa')).toHaveLength(2);
  });
});

describe('buildSearchExcerpt', () => {
  it('stays inside the block that holds the match and marks every match in it', () => {
    const text = 'First block\nThe tag on turtle 12 and its tag log\nThird';
    const ranges = findSearchMatches(text, parseSearchQuery('tag'));
    const excerpt = buildSearchExcerpt(text, ranges, 0);
    expect(excerpt?.text).toBe('The tag on turtle 12 and its tag log');
    expect(marked(excerpt!.text, excerpt!.highlights)).toEqual(['tag', 'tag']);
  });

  it('cuts a long line around the match and says so', () => {
    const text = `${'word '.repeat(40)}target ${'tail '.repeat(60)}`;
    const ranges = findSearchMatches(text, parseSearchQuery('target'));
    const excerpt = buildSearchExcerpt(text, ranges, 0)!;
    expect(excerpt.text.startsWith('…')).toBe(true);
    expect(excerpt.text.endsWith('…')).toBe(true);
    expect(marked(excerpt.text, excerpt.highlights)).toEqual(['target']);
  });

  it('starts no earlier than minStart, so excerpts in a row do not repeat', () => {
    const text = 'tag one tag two tag three';
    const ranges = findSearchMatches(text, parseSearchQuery('tag'));
    const first = buildSearchExcerpt(text, ranges, 0, { length: 8 })!;
    expect(first.text).toBe('tag one…');
    const second = buildSearchExcerpt(text, ranges, 1, {
      length: 8,
      minStart: first.sourceEnd,
    })!;
    expect(second.text).toBe('…tag two…');
    expect(marked(second.text, second.highlights)).toEqual(['tag']);
  });
});

describe('countWords', () => {
  it('counts words in any script', () => {
    expect(countWords('Tortue caouanne, 12 œufs — éclos.')).toBe(5);
    expect(countWords(null)).toBe(0);
  });
});
