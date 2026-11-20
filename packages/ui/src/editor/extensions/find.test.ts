import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';

import {
  createFindPlugin,
  findInDoc,
  findPluginKey,
} from '@colanode/ui/editor/extensions/find';

// A paragraph, bold text and an inline atom (the shape of a mention chip).
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    mention: { group: 'inline', inline: true, atom: true },
    text: { group: 'inline' },
  },
  marks: { bold: {} },
});

const p = (...parts: (string | 'MENTION' | { bold: string })[]) =>
  schema.nodes.paragraph!.create(
    null,
    parts.map((part) =>
      part === 'MENTION'
        ? schema.nodes.mention!.create()
        : typeof part === 'string'
          ? schema.text(part)
          : schema.text(part.bold, [schema.marks.bold!.create()])
    )
  );

const docOf = (...paragraphs: ReturnType<typeof p>[]) =>
  schema.nodes.doc!.create(null, paragraphs);

const textAt = (doc: ReturnType<typeof docOf>, from: number, to: number) =>
  doc.textBetween(from, to);

describe('findInDoc', () => {
  it('finds every match, ignoring case and accents', () => {
    const doc = docOf(p('Tortue et tortue'), p('Une TORTUE, une tôrtue'));
    const matches = findInDoc(doc, 'tortue');
    expect(matches).toHaveLength(4);
    expect(matches.map((m) => textAt(doc, m.from, m.to))).toEqual([
      'Tortue',
      'tortue',
      'TORTUE',
      'tôrtue',
    ]);
  });

  it('reads text split by marks as one run', () => {
    const doc = docOf(p('the tor', { bold: 'tue' }, ' swims'));
    const [match] = findInDoc(doc, 'tortue');
    expect(textAt(doc, match!.from, match!.to)).toBe('tortue');
  });

  it('never matches across an inline node or between blocks', () => {
    const doc = docOf(p('tor', 'MENTION', 'tue'), p('tor'), p('tue'));
    expect(findInDoc(doc, 'tortue')).toEqual([]);
  });

  it('honours match case and whole word', () => {
    const doc = docOf(p('Tag tags tag'));
    expect(findInDoc(doc, 'Tag', { matchCase: true })).toHaveLength(1);
    expect(findInDoc(doc, 'tag', { wholeWord: true })).toHaveLength(2);
  });
});

describe('find plugin', () => {
  const stateOf = (...paragraphs: ReturnType<typeof p>[]) =>
    EditorState.create({
      doc: docOf(...paragraphs),
      plugins: [createFindPlugin()],
    });

  const find = (state: EditorState) => findPluginKey.getState(state)!;

  it('starts at the first match after the caret', () => {
    let state = stateOf(p('tag one tag two tag'));
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 6))
    );
    state = state.apply(state.tr.setMeta(findPluginKey, { query: 'tag' }));
    expect(find(state).matches).toHaveLength(3);
    expect(find(state).current).toBe(1);
  });

  it('follows the document as it is edited, staying on the same match', () => {
    let state = stateOf(p('tag one tag two'));
    state = state.apply(
      state.tr.setMeta(findPluginKey, { query: 'tag', current: 1 })
    );
    // Typing "tag " at the start adds a match before the current one.
    state = state.apply(state.tr.insertText('tag ', 1));
    expect(find(state).matches).toHaveLength(3);
    const third = find(state).matches[2]!.from;
    expect(textAt(state.doc, third, third + 7)).toBe('tag two');
    expect(find(state).current).toBe(2);
  });

  it('marks only the current match as current', () => {
    let state = stateOf(p('tag tag'));
    state = state.apply(state.tr.setMeta(findPluginKey, { query: 'tag' }));
    const decorations = find(state).decorations.find();
    expect(decorations).toHaveLength(2);
    expect(
      decorations.filter((decoration) =>
        String(
          (decoration as unknown as { type: { attrs: { class: string } } }).type
            .attrs.class
        ).includes('find-match-current')
      )
    ).toHaveLength(1);
  });

  it('clears everything when the query is emptied', () => {
    let state = stateOf(p('tag'));
    state = state.apply(state.tr.setMeta(findPluginKey, { query: 'tag' }));
    state = state.apply(state.tr.setMeta(findPluginKey, { query: '' }));
    expect(find(state).matches).toEqual([]);
    expect(find(state).current).toBe(-1);
    expect(find(state).decorations.find()).toHaveLength(0);
  });
});
