import { describe, expect, it } from 'vitest';

import {
  blockBelow,
  innerHandleTarget,
  type PathStep,
} from '@colanode/ui/editor/menus/block-target';

// 'taskList', 'taskItem:2' ... -> path steps; the number is the child index.
const path = (...steps: string[]): PathStep[] =>
  ['doc', ...steps].map((step) => {
    const [type, index] = step.split(':');
    return { type: type ?? '', index: Number(index ?? 0) };
  });

describe('innerHandleTarget', () => {
  it('grabs the task the pointer is on', () => {
    expect(
      innerHandleTarget(path('taskList', 'taskItem:3', 'paragraph'))
    ).toEqual({ depth: 2, anchor: 'list' });
  });

  it('grabs the sub-task, not the task that holds it', () => {
    expect(
      innerHandleTarget(
        path('taskList', 'taskItem', 'taskList:1', 'taskItem:2', 'paragraph')
      )
    ).toEqual({ depth: 4, anchor: 'list' });
  });

  it('works for bullet and numbered lists', () => {
    expect(
      innerHandleTarget(path('bulletList', 'listItem:1', 'paragraph'))
    ).toEqual({ depth: 2, anchor: 'list' });
    expect(
      innerHandleTarget(
        path('orderedList', 'listItem', 'bulletList:1', 'listItem', 'paragraph')
      )
    ).toEqual({ depth: 4, anchor: 'list' });
  });

  it('grabs a block in the body of a toggle', () => {
    expect(
      innerHandleTarget(path('toggle', 'toggleContent:1', 'paragraph:2'))
    ).toEqual({ depth: 3, anchor: 'self' });
  });

  it('leaves the toggle title to the whole toggle', () => {
    expect(innerHandleTarget(path('toggle', 'toggleSummary'))).toBeNull();
  });

  it("leaves a callout's or quote's own text to the whole container", () => {
    expect(innerHandleTarget(path('callout', 'paragraph:0'))).toBeNull();
    expect(innerHandleTarget(path('blockquote', 'paragraph:0'))).toBeNull();
  });

  it('grabs the blocks after the first in a callout or quote', () => {
    expect(innerHandleTarget(path('callout', 'paragraph:1'))).toEqual({
      depth: 2,
      anchor: 'container',
    });
    expect(innerHandleTarget(path('blockquote', 'heading2:2'))).toEqual({
      depth: 2,
      anchor: 'container',
    });
  });

  it('takes the deepest target: a task inside a toggle', () => {
    expect(
      innerHandleTarget(
        path(
          'toggle',
          'toggleContent:1',
          'taskList:0',
          'taskItem:1',
          'paragraph'
        )
      )
    ).toEqual({ depth: 4, anchor: 'list' });
  });

  it('finds an item inside a column', () => {
    expect(
      innerHandleTarget(
        path('columns', 'column:1', 'taskList', 'taskItem:1', 'paragraph')
      )
    ).toEqual({ depth: 4, anchor: 'list' });
  });

  it('is null for a plain top-level block', () => {
    expect(innerHandleTarget(path('paragraph:4'))).toBeNull();
    expect(innerHandleTarget(path('taskList'))).toBeNull();
    expect(innerHandleTarget(path())).toBeNull();
  });
});

describe('blockBelow', () => {
  it('adds an unticked task below a task', () => {
    expect(blockBelow('taskItem')).toEqual({
      type: 'taskItem',
      attrs: { checked: false },
      content: [{ type: 'paragraph' }],
    });
  });

  it('adds a bullet below a bullet', () => {
    expect(blockBelow('listItem')).toEqual({
      type: 'listItem',
      content: [{ type: 'paragraph' }],
    });
  });

  it('adds a paragraph below any other block', () => {
    expect(blockBelow('heading2')).toEqual({ type: 'paragraph' });
    expect(blockBelow('taskList')).toEqual({ type: 'paragraph' });
  });
});
