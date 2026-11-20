// ABOUTME: Find and replace in the open page: every match marked, the current one
// ABOUTME: brighter, next/previous, and the count the find bar shows as "3 / 12".
import { Extension } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';

import { SubstringMatchOptions, findSubstringMatches } from '@colanode/core';

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  options: SubstringMatchOptions;
  matches: FindMatch[];
  // -1 while there is nothing to point at.
  current: number;
  decorations: DecorationSet;
}

interface FindMeta {
  query?: string;
  options?: SubstringMatchOptions;
  current?: number;
  // Point at the first match at or after this position.
  seekFrom?: number;
}

export const findPluginKey = new PluginKey<FindState>('find');

// Past this the bar shows "10000+": a page that long is read with the count,
// not by stepping through it.
export const FIND_MAX_MATCHES = 10000;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    find: {
      setFindQuery: (
        query: string,
        options?: SubstringMatchOptions
      ) => ReturnType;
      setFindIndex: (index: number) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      clearFind: () => ReturnType;
      replaceCurrentMatch: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}

// Every match in the document, each inside one block. Text split by marks
// ("tor**tue**") reads as one run; an inline node such as a mention or a
// formula breaks the run, so a match never spans one.
export const findInDoc = (
  doc: ProseMirrorNode,
  query: string,
  options: SubstringMatchOptions = {}
): FindMatch[] => {
  const matches: FindMatch[] = [];
  if (!query) {
    return matches;
  }

  doc.descendants((node, pos) => {
    if (matches.length >= FIND_MAX_MATCHES) {
      return false;
    }
    if (!node.isTextblock) {
      return true;
    }

    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          positions.push(start + i);
        }
        text += child.text;
      } else {
        positions.push(start);
        text += '￼';
      }
    });

    for (const range of findSubstringMatches(text, query, options)) {
      const from = positions[range.start];
      const last = positions[range.end - 1];
      if (from === undefined || last === undefined) {
        continue;
      }
      matches.push({ from, to: last + 1 });
      if (matches.length >= FIND_MAX_MATCHES) {
        break;
      }
    }
    return false;
  });

  return matches;
};

const firstAtOrAfter = (matches: FindMatch[], pos: number): number => {
  if (matches.length === 0) {
    return -1;
  }
  const index = matches.findIndex((match) => match.from >= pos);
  return index === -1 ? 0 : index;
};

const buildDecorations = (
  doc: ProseMirrorNode,
  matches: FindMatch[],
  current: number
): DecorationSet =>
  matches.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(
        doc,
        matches.map((match, index) =>
          Decoration.inline(match.from, match.to, {
            class:
              index === current
                ? 'find-match find-match-current'
                : 'find-match',
          })
        )
      );

const EMPTY_STATE: FindState = {
  query: '',
  options: {},
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
};

const nextState = (
  tr: Transaction,
  value: FindState,
  doc: ProseMirrorNode
): FindState => {
  const meta = tr.getMeta(findPluginKey) as FindMeta | undefined;
  if (!meta && (!tr.docChanged || value.query === '')) {
    return value;
  }

  const query = meta?.query ?? value.query;
  const options = meta?.options ?? value.options;
  const research =
    tr.docChanged || meta?.query !== undefined || meta?.options !== undefined;
  const matches = research ? findInDoc(doc, query, options) : value.matches;

  let current: number;
  if (matches.length === 0) {
    current = -1;
  } else if (meta?.current !== undefined) {
    current = Math.min(Math.max(meta.current, 0), matches.length - 1);
  } else if (meta?.seekFrom !== undefined) {
    current = firstAtOrAfter(matches, meta.seekFrom);
  } else if (meta?.query !== undefined || meta?.options !== undefined) {
    // A new search starts from where the reader is.
    current = firstAtOrAfter(matches, tr.selection.from);
  } else if (value.current >= 0 && value.matches[value.current]) {
    // An edit elsewhere keeps the bar on the same match.
    current = firstAtOrAfter(
      matches,
      tr.mapping.map(value.matches[value.current]!.from)
    );
  } else {
    current = 0;
  }

  return {
    query,
    options,
    matches,
    current,
    decorations: buildDecorations(doc, matches, current),
  };
};

export const getFindState = (state: EditorState): FindState | undefined =>
  findPluginKey.getState(state);

// Brings the current match into the middle of the screen. Read from the DOM,
// where the decoration has been drawn by the time a command returns.
export const scrollToCurrentMatch = (view: EditorView) => {
  const element = view.dom.querySelector<HTMLElement>('.find-match-current');
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

export const createFindPlugin = () =>
  new Plugin<FindState>({
    key: findPluginKey,
    state: {
      init: () => EMPTY_STATE,
      apply: (tr, value, _oldState, newState) =>
        nextState(tr, value, newState.doc),
    },
    props: {
      decorations: (state) => findPluginKey.getState(state)?.decorations,
    },
  });

export const FindExtension = Extension.create({
  name: 'find',

  addCommands() {
    return {
      setFindQuery:
        (query, options) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findPluginKey, { query, options: options ?? {} });
            tr.setMeta('addToHistory', false);
          }
          return true;
        },
      setFindIndex:
        (index) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findPluginKey, { current: index });
            tr.setMeta('addToHistory', false);
          }
          return true;
        },
      findNext:
        () =>
        ({ state, tr, dispatch }) => {
          const find = findPluginKey.getState(state);
          if (!find || find.matches.length === 0) {
            return false;
          }
          if (dispatch) {
            tr.setMeta(findPluginKey, {
              current: (find.current + 1) % find.matches.length,
            });
            tr.setMeta('addToHistory', false);
          }
          return true;
        },
      findPrevious:
        () =>
        ({ state, tr, dispatch }) => {
          const find = findPluginKey.getState(state);
          if (!find || find.matches.length === 0) {
            return false;
          }
          if (dispatch) {
            tr.setMeta(findPluginKey, {
              current:
                (find.current - 1 + find.matches.length) % find.matches.length,
            });
            tr.setMeta('addToHistory', false);
          }
          return true;
        },
      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findPluginKey, { query: '', options: {} });
            tr.setMeta('addToHistory', false);
          }
          return true;
        },
      replaceCurrentMatch:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const find = findPluginKey.getState(state);
          const match = find?.matches[find.current];
          if (!find || !match) {
            return false;
          }
          if (dispatch) {
            if (replacement.length > 0) {
              tr.insertText(replacement, match.from, match.to);
            } else {
              tr.delete(match.from, match.to);
            }
            // On to the next match, past the text just written, which may
            // itself contain what is being looked for.
            tr.setMeta(findPluginKey, {
              seekFrom: match.from + replacement.length,
            });
          }
          return true;
        },
      replaceAllMatches:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const find = findPluginKey.getState(state);
          if (!find || find.matches.length === 0) {
            return false;
          }
          if (dispatch) {
            // From the end, so the positions of the matches not yet replaced
            // still hold.
            for (const match of [...find.matches].reverse()) {
              if (replacement.length > 0) {
                tr.insertText(replacement, match.from, match.to);
              } else {
                tr.delete(match.from, match.to);
              }
            }
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [createFindPlugin()];
  },
});
