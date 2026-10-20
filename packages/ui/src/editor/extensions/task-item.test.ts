// @vitest-environment jsdom
import { Editor, JSONContent } from '@tiptap/core';
import DocumentNode from '@tiptap/extension-document';
import TextNode from '@tiptap/extension-text';
import { afterEach, describe, expect, it } from 'vitest';

import { ParagraphNode } from '@colanode/ui/editor/extensions/paragraph';
import { TabKeymapExtension } from '@colanode/ui/editor/extensions/tab-keymap';
import { TaskItemNode } from '@colanode/ui/editor/extensions/task-item';
import { TaskListNode } from '@colanode/ui/editor/extensions/task-list';

const task = (
  text: string,
  checked = false,
  children: JSONContent[] = []
): JSONContent => ({
  type: 'taskItem',
  attrs: { checked },
  content: [
    { type: 'paragraph', content: [{ type: 'text', text }] },
    ...children,
  ],
});

const checklist = (...items: JSONContent[]): JSONContent => ({
  type: 'taskList',
  content: items,
});

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

// Same relative order as the page and record editors: TabKeymap is declared
// before the task nodes, so the task item's Tab must win over it.
const open = (...content: JSONContent[]) => {
  editor = new Editor({
    extensions: [
      DocumentNode,
      ParagraphNode,
      TextNode,
      TabKeymapExtension,
      TaskListNode,
      TaskItemNode,
    ],
    content: { type: 'doc', content },
  });
  return editor;
};

const press = (target: Editor, key: string, shiftKey = false) => {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  return (
    target.view.someProp('handleKeyDown', (handler) =>
      handler(target.view, event)
    ) ?? false
  );
};

const placeCursorAfter = (target: Editor, text: string) => {
  let position = -1;
  target.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      position = pos + node.nodeSize;
    }
  });
  expect(position).toBeGreaterThan(0);
  target.commands.setTextSelection(position);
};

type Outline = { text: string; checked: boolean; children: Outline[] };

// The checklist as a tree of task texts, so a test reads like the page.
const outline = (target: Editor): Outline[] => {
  const walk = (list: JSONContent | undefined): Outline[] =>
    (list?.content ?? []).map((item) => ({
      text: item.content?.[0]?.content?.[0]?.text ?? '',
      checked: item.attrs?.checked === true,
      children: walk(item.content?.find((child) => child.type === 'taskList')),
    }));
  return walk(target.getJSON().content?.[0]);
};

const leaf = (text: string, checked = false): Outline => ({
  text,
  checked,
  children: [],
});

describe('checklist indentation', () => {
  it('Tab nests a task under the one above it', () => {
    const target = open(checklist(task('Order parts'), task('Battery')));
    placeCursorAfter(target, 'Battery');

    expect(press(target, 'Tab')).toBe(true);

    expect(outline(target)).toEqual([
      { text: 'Order parts', checked: false, children: [leaf('Battery')] },
    ]);
  });

  it('Tab types no tab character into the task', () => {
    const target = open(checklist(task('Order parts'), task('Battery')));
    placeCursorAfter(target, 'Battery');
    press(target, 'Tab');

    expect(target.getText()).not.toContain('\t');
  });

  it('nests one level deeper on each Tab', () => {
    const target = open(
      checklist(task('Enclosure'), task('Screws'), task('M2 screws'))
    );
    placeCursorAfter(target, 'Screws');
    press(target, 'Tab');
    placeCursorAfter(target, 'M2 screws');
    press(target, 'Tab');
    press(target, 'Tab');

    expect(outline(target)).toEqual([
      {
        text: 'Enclosure',
        checked: false,
        children: [
          { text: 'Screws', checked: false, children: [leaf('M2 screws')] },
        ],
      },
    ]);
  });

  it('Shift-Tab brings a nested task back out', () => {
    const target = open(
      checklist(task('Order parts', false, [checklist(task('Battery'))]))
    );
    placeCursorAfter(target, 'Battery');

    expect(press(target, 'Tab', true)).toBe(true);

    expect(outline(target)).toEqual([leaf('Order parts'), leaf('Battery')]);
  });

  it('keeps a ticked task ticked when it is indented', () => {
    const target = open(checklist(task('Order parts'), task('Battery', true)));
    placeCursorAfter(target, 'Battery');
    press(target, 'Tab');

    expect(outline(target)).toEqual([
      {
        text: 'Order parts',
        checked: false,
        children: [leaf('Battery', true)],
      },
    ]);
  });

  it('opens an existing flat checklist unchanged', () => {
    const flat = checklist(task('Order parts', true), task('Battery'));
    const target = open(flat);

    expect(target.getJSON().content).toEqual([flat]);
  });

  it('still types a tab character outside a checklist', () => {
    const target = open({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Notes' }],
    });
    placeCursorAfter(target, 'Notes');
    press(target, 'Tab');

    expect(target.getText()).toBe('Notes\t');
  });
});
