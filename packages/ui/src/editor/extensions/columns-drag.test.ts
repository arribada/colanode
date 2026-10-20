import { Fragment, Schema } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';

import {
  canSideDrop,
  columnChildDepth,
  sideForPointer,
} from '@colanode/ui/editor/extensions/columns-drag';

// A 250px image drawn at x 100..350, the way an image block shows on a page.
const image = { left: 100, right: 350, width: 250 };

describe('sideForPointer', () => {
  it('arms the right side in the empty space beside a narrow image', () => {
    expect(sideForPointer(390, image)).toBe('right');
    expect(sideForPointer(900, image)).toBe('right');
  });

  it('arms each side near its edge and nothing in the middle', () => {
    expect(sideForPointer(110, image)).toBe('left');
    expect(sideForPointer(340, image)).toBe('right');
    expect(sideForPointer(225, image)).toBeNull();
  });

  it('arms the left side before the block', () => {
    expect(sideForPointer(40, image)).toBe('left');
  });
});

describe('columnChildDepth', () => {
  it('returns the depth of the block that is a column child', () => {
    // doc > columns > column > paragraph
    expect(columnChildDepth(['doc', 'columns', 'column', 'paragraph'])).toBe(3);
  });

  it('returns the outer block inside the column, not a nested descendant', () => {
    // doc > columns > column > bulletList > listItem > paragraph
    expect(
      columnChildDepth([
        'doc',
        'columns',
        'column',
        'bulletList',
        'listItem',
        'paragraph',
      ])
    ).toBe(3);
  });

  it('returns null for a top-level block outside any column', () => {
    expect(columnChildDepth(['doc', 'paragraph'])).toBeNull();
  });
});

// Just enough schema to ask a column what it can hold.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    column: { content: 'block+' },
    taskList: { group: 'block', content: 'taskItem+' },
    taskItem: { content: 'paragraph block*' },
    text: {},
  },
});
const node = (name: string) => {
  const paragraph = schema.nodes.paragraph!.create(null, schema.text('x'));
  if (name === 'taskItem') {
    return schema.nodes.taskItem!.create(null, paragraph);
  }
  if (name === 'taskList') {
    return schema.nodes.taskList!.create(
      null,
      schema.nodes.taskItem!.create(null, paragraph)
    );
  }
  return paragraph;
};

describe('canSideDrop', () => {
  const column = schema.nodes.column;

  it('lets a block, or a whole list, go into a column', () => {
    expect(canSideDrop(column, Fragment.from(node('paragraph')))).toBe(true);
    expect(canSideDrop(column, Fragment.from(node('taskList')))).toBe(true);
  });

  it('keeps a single list item out of a side-drop', () => {
    expect(canSideDrop(column, Fragment.from(node('taskItem')))).toBe(false);
  });

  it('is off without a column node or anything dragged', () => {
    expect(canSideDrop(undefined, Fragment.from(node('paragraph')))).toBe(
      false
    );
    expect(canSideDrop(column, Fragment.empty)).toBe(false);
  });
});
