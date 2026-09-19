import { Schema } from '@tiptap/pm/model';
import { EditorState, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';
import { describe, expect, it } from 'vitest';

import {
  blockDropPosition,
  createUploadPlaceholderPlugin,
  findUploadPlaceholder,
} from '@colanode/ui/editor/extensions/upload-placeholder';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    file: { group: 'block', atom: true },
    text: {},
  },
});

const key = new PluginKey<DecorationSet>('test-upload-placeholder');

const docOf = (...lines: string[]) =>
  schema.node(
    'doc',
    null,
    lines.map((line) =>
      schema.node('paragraph', null, line ? [schema.text(line)] : [])
    )
  );

const stateOf = (doc = docOf('first line', 'second line')) =>
  EditorState.create({
    schema,
    doc,
    plugins: [createUploadPlaceholderPlugin(key)],
  });

describe('blockDropPosition', () => {
  it('puts a dropped block between lines, never inside one', () => {
    const doc = docOf('first line', 'second line');
    // Position 5 is in the middle of "first line".
    const pos = blockDropPosition(doc, 5, schema.node('file'));

    expect(doc.resolve(pos).depth).toBe(0);
  });

  it('keeps a position that is already between blocks', () => {
    const doc = docOf('first line', 'second line');
    const between = doc.child(0).nodeSize; // right after the first paragraph

    expect(blockDropPosition(doc, between, schema.node('file'))).toBe(between);
  });
});

describe('upload placeholder', () => {
  it('stays on its spot while text is typed above it', () => {
    let state = stateOf();
    const spot = state.doc.child(0).nodeSize;
    state = state.apply(
      state.tr.setMeta(key, { add: [{ id: 'a', pos: spot }] })
    );

    state = state.apply(state.tr.insertText('typed ', 1));

    expect(findUploadPlaceholder(state, key, 'a')).toBe(spot + 'typed '.length);
  });

  it('is gone once removed', () => {
    let state = stateOf();
    state = state.apply(state.tr.setMeta(key, { add: [{ id: 'a', pos: 1 }] }));
    state = state.apply(state.tr.setMeta(key, { remove: ['a'] }));

    expect(findUploadPlaceholder(state, key, 'a')).toBeNull();
  });

  it('lands files dropped together in the order they came', () => {
    let state = stateOf();
    const spot = state.doc.child(0).nodeSize;
    state = state.apply(
      state.tr.setMeta(key, {
        add: [
          { id: 'first', pos: spot },
          { id: 'second', pos: spot },
        ],
      })
    );

    // The first file lands on its spot...
    const firstAt = findUploadPlaceholder(state, key, 'first')!;
    state = state.apply(
      state.tr
        .setMeta(key, { remove: ['first'] })
        .insert(firstAt, schema.node('file'))
    );

    // ...and the second one's spot is now after it, not before.
    expect(findUploadPlaceholder(state, key, 'second')).toBe(firstAt + 1);
  });
});
