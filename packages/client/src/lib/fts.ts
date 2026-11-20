// Helpers for building SQLite FTS5 match queries and plain-text snippets.
// Snippets are computed here from the source text (the local nodes/documents
// tables) rather than via the FTS5 snippet() function, so the search handlers
// stay decoupled from the FTS schema.

import { ParsedSearchQuery } from '@colanode/core';

const SNIPPET_CONTEXT_BEFORE = 40;
const SNIPPET_MAX_LENGTH = 150;

export const tokenizeSearchQuery = (searchQuery: string): string[] => {
  return searchQuery
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
};

// Builds an FTS5 match expression performing a prefix search for every token.
// Tokens come from tokenizeSearchQuery, so they never contain double quotes
// and can be safely wrapped in FTS5 string syntax. An optional column filter
// restricts the match to a single indexed column.
export const buildFtsMatchQuery = (
  tokens: string[],
  column?: string
): string | null => {
  if (tokens.length === 0) {
    return null;
  }

  const expression = tokens.map((token) => `"${token}"*`).join(' ');
  return column ? `${column} : (${expression})` : expression;
};

// One FTS5 expression per thing the search box asks for -- each word as a
// prefix, each "phrase" as its words side by side -- so the caller can match
// them one at a time: a page whose title holds one word and whose body holds
// the other still has both. Parsed words are letters and digits only, so they
// never carry a double quote out of their FTS5 string.
export const buildFtsUnitQueries = (
  parsed: ParsedSearchQuery,
  column?: string
): string[] => {
  const units = [
    ...parsed.phrases.map((phrase) => `"${phrase.join(' ')}"`),
    ...parsed.terms.map((term) => `"${term}"*`),
  ];
  return column ? units.map((unit) => `${column} : (${unit})`) : units;
};

// Excluded words match whole: "-tag" leaves out the pages that say "tag", not
// every page that says "tags".
export const buildFtsExclusionQuery = (
  parsed: ParsedSearchQuery
): string | null => {
  if (parsed.excluded.length === 0) {
    return null;
  }
  return parsed.excluded.map((word) => `"${word}"`).join(' OR ');
};

export const buildSnippet = (
  text: string | null | undefined,
  tokens: string[]
): string | null => {
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return null;
  }

  const lower = normalized.toLowerCase();
  let matchIndex = -1;
  for (const token of tokens) {
    const index = lower.indexOf(token.toLowerCase());
    if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
    }
  }

  // The FTS tokenizer may have matched a normalized form (e.g. diacritics)
  // that a plain string search cannot find; fall back to the beginning.
  const start =
    matchIndex === -1 ? 0 : Math.max(0, matchIndex - SNIPPET_CONTEXT_BEFORE);

  const prefix = start > 0 ? '…' : '';
  const suffix = start + SNIPPET_MAX_LENGTH < normalized.length ? '…' : '';
  return (
    prefix + normalized.slice(start, start + SNIPPET_MAX_LENGTH).trim() + suffix
  );
};
