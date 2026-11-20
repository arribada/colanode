// ABOUTME: Reads a search box the way the wiki's search reads it (words, "exact phrases",
// ABOUTME: -excluded words) and finds, counts and excerpts what it matches in a text.

export interface SearchTextRange {
  start: number;
  end: number;
}

export interface ParsedSearchQuery {
  // A word matches every word that starts with it: "tort" finds "Tortues".
  terms: string[];
  // A phrase matches its words side by side, each one whole.
  phrases: string[][];
  // A page holding one of these words is left out of the results.
  excluded: string[];
}

export interface SearchExcerpt {
  text: string;
  highlights: SearchTextRange[];
  // The span of the source text the excerpt shows.
  sourceStart: number;
  sourceEnd: number;
}

const WORD = /[\p{L}\p{N}]+/gu;
const COMBINING_MARK = /\p{M}/u;

// Case and accents never decide a match: "eclosion" finds "Éclosion", the way
// the SQLite index (unicode61, diacritics removed) already matches them.
export const foldSearchText = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const wordsOf = (value: string, fold: boolean): string[] =>
  ((fold ? foldSearchText(value) : value).match(WORD) ?? []).filter(
    (word) => word.length > 0
  );

// `fold: false` keeps the words as typed, for a matcher that folds case
// itself but not accents (Postgres ILIKE).
export const parseSearchQuery = (
  query: string,
  options: { fold?: boolean } = {}
): ParsedSearchQuery => {
  const fold = options.fold ?? true;
  const words = (value: string) => wordsOf(value, fold);
  const terms: string[] = [];
  const phrases: string[][] = [];
  const excluded: string[] = [];

  // A quote that is never closed is read as plain words, so a phrase being
  // typed still finds something before its closing quote.
  for (const match of query.matchAll(/"([^"]*)"|(\S+)/g)) {
    if (match[1] !== undefined) {
      const phrase = words(match[1]);
      if (phrase.length > 0) {
        phrases.push(phrase);
      }
      continue;
    }

    const token = match[2] ?? '';
    if (token.startsWith('-') && token.length > 1) {
      excluded.push(...words(token.slice(1)));
      continue;
    }

    terms.push(...words(token));
  }

  return {
    terms: [...new Set(terms)],
    phrases,
    excluded: [...new Set(excluded)],
  };
};

export const hasSearchTerms = (parsed: ParsedSearchQuery): boolean =>
  parsed.terms.length > 0 || parsed.phrases.length > 0;

// The text with case and accents folded, and for each folded character the
// offset of the character it came from, so a match found in the folded text
// can be drawn on the original one.
const foldWithOffsets = (
  text: string
): { folded: string; offsetAt: (index: number) => number } => {
  const folded = foldSearchText(text);
  // Without combining marks no character folds to nothing, so an unchanged
  // length means every character folded to exactly one: offsets are 1:1.
  if (folded.length === text.length && !COMBINING_MARK.test(text)) {
    return { folded, offsetAt: (index) => index };
  }

  let built = '';
  const offsets: number[] = [];
  for (let i = 0; i < text.length;) {
    const codePoint = text.codePointAt(i) ?? 0;
    const char = String.fromCodePoint(codePoint);
    const piece = foldSearchText(char);
    for (let k = 0; k < piece.length; k++) {
      offsets.push(i);
    }
    built += piece;
    i += char.length;
  }
  offsets.push(text.length);
  return {
    folded: built,
    offsetAt: (index) => offsets[index] ?? text.length,
  };
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const WORD_START = '(?<![\\p{L}\\p{N}])';
const WORD_END = '(?![\\p{L}\\p{N}])';

const buildSearchPattern = (parsed: ParsedSearchQuery): RegExp | null => {
  // Longest first: at "tortue", the alternative "tort" would otherwise win and
  // only half the word would be marked.
  const parts = [
    ...parsed.phrases
      .map((phrase) => phrase.map(escapeRegExp).join('[^\\p{L}\\p{N}]+'))
      .map((body) => WORD_START + body + WORD_END),
    ...[...parsed.terms]
      .sort((a, b) => b.length - a.length)
      .map((term) => WORD_START + escapeRegExp(term)),
  ];
  return parts.length > 0 ? new RegExp(parts.join('|'), 'gu') : null;
};

// Every place the query matches in `text`, in order, as ranges of the
// original text. The same rule as the index: a word matches the words that
// start with it, a phrase its words side by side.
export const findSearchMatches = (
  text: string | null | undefined,
  parsed: ParsedSearchQuery,
  limit = Number.POSITIVE_INFINITY
): SearchTextRange[] => {
  if (!text) {
    return [];
  }
  const pattern = buildSearchPattern(parsed);
  if (!pattern) {
    return [];
  }

  const { folded, offsetAt } = foldWithOffsets(text);
  const ranges: SearchTextRange[] = [];
  for (const match of folded.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (match[0].length === 0) {
      continue;
    }
    ranges.push({
      start: offsetAt(index),
      end: offsetAt(index + match[0].length),
    });
    if (ranges.length >= limit) {
      break;
    }
  }
  return ranges;
};

export interface SubstringMatchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char);

// Every place `needle` appears in `text`, the way a find bar looks for it:
// anywhere, even inside a word. Without matchCase, case and accents are
// ignored; with wholeWord, a match must not touch a letter on either side.
export const findSubstringMatches = (
  text: string,
  needle: string,
  options: SubstringMatchOptions = {}
): SearchTextRange[] => {
  if (!text || !needle) {
    return [];
  }

  const source = options.matchCase
    ? { folded: text, offsetAt: (index: number) => index }
    : foldWithOffsets(text);
  const target = options.matchCase ? needle : foldSearchText(needle);
  if (target.length === 0) {
    return [];
  }

  const ranges: SearchTextRange[] = [];
  let from = 0;
  for (;;) {
    const index = source.folded.indexOf(target, from);
    if (index === -1) {
      break;
    }
    const end = index + target.length;
    if (
      !options.wholeWord ||
      (!isWordChar(source.folded[index - 1]) && !isWordChar(source.folded[end]))
    ) {
      ranges.push({ start: source.offsetAt(index), end: source.offsetAt(end) });
    }
    from = end;
  }
  return ranges;
};

const EXCERPT_BEFORE = 48;
const EXCERPT_LENGTH = 180;

// One line of context around `ranges[index]`, kept inside its own block (the
// texts join blocks with a newline), with every match that falls inside it
// marked. The returned highlights are offsets into the excerpt's text.
// `minStart` keeps a run of excerpts from showing the same words twice.
export const buildSearchExcerpt = (
  text: string,
  ranges: SearchTextRange[],
  index: number,
  options: { length?: number; minStart?: number } = {}
): SearchExcerpt | null => {
  const range = ranges[index];
  if (!range) {
    return null;
  }
  const length = options.length ?? EXCERPT_LENGTH;

  const lineStart = text.lastIndexOf('\n', range.start - 1) + 1;
  const floor = Math.max(
    lineStart,
    Math.min(options.minStart ?? 0, range.start)
  );
  const lineEndAt = text.indexOf('\n', range.end);
  const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;

  let start = Math.max(floor, range.start - EXCERPT_BEFORE);
  // Start on a word rather than in the middle of one.
  if (start > floor) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < range.start && space - start < 16) {
      start = space + 1;
    }
  }
  const end = Math.min(lineEnd, Math.max(start + length, range.end));

  const prefix = start > lineStart ? '…' : '';
  const suffix = end < lineEnd ? '…' : '';
  const body = text.slice(start, end).replace(/\t/g, ' ').trimEnd();
  const shift = prefix.length - start;

  const highlights = ranges
    .filter((other) => other.start >= start && other.end <= end)
    .map((other) => ({ start: other.start + shift, end: other.end + shift }));

  return {
    text: prefix + body + suffix,
    highlights,
    sourceStart: start,
    sourceEnd: end,
  };
};

// The opening of a text, for a preview with nothing to point at.
export const buildTextOpening = (
  text: string | null | undefined,
  length = 600
): string | null => {
  if (!text) {
    return null;
  }
  const trimmed = text.replace(/\n{3,}/g, '\n\n').trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.length > length ? `${trimmed.slice(0, length)}…` : trimmed;
};

export const countWords = (text: string | null | undefined): number =>
  text ? (text.match(WORD) ?? []).length : 0;
