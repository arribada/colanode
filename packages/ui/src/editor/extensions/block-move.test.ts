import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';

import {
  moveBlock,
  selectedBlockPos,
} from '@colanode/ui/editor/extensions/block-move';

// The shapes the wiki editor moves: paragraphs, a picture (an atom carrying
// its caption and placement as attrs), lists.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    file: {
      group: 'block',
      atom: true,
      attrs: { caption: { default: null }, align: { default: null } },
    },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph+' },
    text: { group: 'inline' },
  },
});

const p = (text: string) =>
  schema.nodes.paragraph!.create(null, schema.text(text));
const file = (attrs?: { caption?: string; align?: string }) =>
  schema.nodes.file!.create(attrs ?? null);
const item = (text: string) => schema.nodes.listItem!.create(null, p(text));
const list = (...items: ReturnType<typeof item>[]) =>
  schema.nodes.bulletList!.create(null, items);

const stateOf = (...blocks: ReturnType<typeof p>[]) =>
  EditorState.create({ doc: schema.nodes.doc!.create(null, blocks) });

const order = (state: { doc: EditorState['doc'] }) =>
  state.doc.children.map((n) =>
    n.type.name === 'paragraph' ? n.textContent : n.type.name
  );

describe('moveBlock', () => {
  it('moves a paragraph below the next one and answers its new start', () => {
    const state = stateOf(p('one'), p('two'), p('three'));
    const tr = state.tr;
    const target = moveBlock(tr, 0, 'down');
    expect(order(tr)).toEqual(['two', 'one', 'three']);
    // "two" is three characters: <p>two</p> spans five positions.
    expect(target).toBe(5);
    expect(tr.doc.nodeAt(target!)?.textContent).toBe('one');
  });

  it('moves a paragraph above the previous one', () => {
    const state = stateOf(p('one'), p('two'), p('three'));
    const tr = state.tr;
    const target = moveBlock(tr, 5, 'up');
    expect(order(tr)).toEqual(['two', 'one', 'three']);
    expect(target).toBe(0);
  });

  it('leaves the first block alone going up and the last going down', () => {
    const state = stateOf(p('one'), p('two'));
    const up = state.tr;
    expect(moveBlock(up, 0, 'up')).toBeNull();
    expect(up.docChanged).toBe(false);
    const down = state.tr;
    expect(moveBlock(down, 5, 'down')).toBeNull();
    expect(down.docChanged).toBe(false);
  });

  it('moves a picture with its caption and placement, leaving other captions alone', () => {
    const state = stateOf(
      p('one'),
      file({ caption: 'Figure A', align: 'center' }),
      p('two'),
      file({ caption: 'Figure B' })
    );
    const tr = state.tr;
    // <p>one</p> = 5, the picture sits at 5 and is one position wide.
    const target = moveBlock(tr, 5, 'down');
    expect(order(tr)).toEqual(['one', 'two', 'file', 'file']);
    const moved = tr.doc.nodeAt(target!);
    expect(moved?.attrs).toEqual({ caption: 'Figure A', align: 'center' });
    const other = tr.doc.child(3);
    expect(other.attrs).toEqual({ caption: 'Figure B', align: null });
  });

  it('moves a list item among its own siblings, not out of the list', () => {
    const state = stateOf(p('intro'), list(item('a'), item('b'), item('c')));
    const tr = state.tr;
    // <p>intro</p> = 7, the list opens at 7, its first item starts at 8.
    const target = moveBlock(tr, 8, 'down');
    const listNode = tr.doc.child(1);
    expect(listNode.children.map((i) => i.textContent)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(tr.doc.nodeAt(target!)?.textContent).toBe('a');
    expect(order(tr)).toEqual(['intro', 'bulletList']);
  });

  it('answers null for a position that is not the start of a block', () => {
    const state = stateOf(p('one'), p('two'));
    const tr = state.tr;
    expect(moveBlock(tr, 2, 'down')).toBeNull();
    expect(tr.docChanged).toBe(false);
  });
});

describe('selectedBlockPos', () => {
  it('finds the top-level paragraph the cursor is in', () => {
    const state = stateOf(p('one'), p('two'));
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 7));
    expect(selectedBlockPos(tr)).toBe(5);
  });

  it('finds the list item, not the paragraph inside it', () => {
    const state = stateOf(p('intro'), list(item('a'), item('b')));
    // The list opens at 7; item a spans 8..13, item b starts at 13.
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 15));
    expect(selectedBlockPos(tr)).toBe(13);
    expect(tr.doc.nodeAt(13)?.type.name).toBe('listItem');
  });
});
