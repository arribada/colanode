import { describe, expect, it } from 'vitest';

import {
  markdownToBlocks,
  richTextToMarkdown,
  unrepresentableBlockTypes,
} from '@colanode/server/lib/ai/tools';

const DOC = 'doc1';

const toContent = (markdown: string) => ({
  type: 'rich_text' as const,
  blocks: markdownToBlocks(DOC, markdown),
});

const roundTrip = (markdown: string): string =>
  richTextToMarkdown(DOC, toContent(markdown));

const typesOf = (markdown: string): string[] =>
  Object.values(markdownToBlocks(DOC, markdown))
    .map((block) => block.type)
    .sort();

describe('markdownToBlocks — tables', () => {
  const table = ['| Tracker | Use case |', '| --- | --- |', '| KIM2 | Argos |'].join(
    '\n'
  );

  it('builds real table nodes instead of paragraphs of pipes', () => {
    const types = typesOf(table);
    expect(types).toContain('table');
    expect(types).toContain('tableRow');
    expect(types).toContain('tableHeader');
    expect(types).toContain('tableCell');
    expect(types).not.toContain('horizontalRule');
  });

  it('nests header cells under a row and a paragraph under each cell', () => {
    const blocks = markdownToBlocks(DOC, table);
    const all = Object.values(blocks);
    const tableBlock = all.find((b) => b.type === 'table')!;
    const rows = all.filter((b) => b.parentId === tableBlock.id);
    expect(rows).toHaveLength(2);
    const headerCells = all.filter((b) => b.parentId === rows[0]!.id);
    expect(headerCells.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader']);
    const cellParagraphs = all.filter((b) => b.parentId === headerCells[0]!.id);
    expect(cellParagraphs.map((p) => p.type)).toEqual(['paragraph']);
  });

  it('survives a round-trip and normalises the delimiter', () => {
    // The source deliberately uses a cramped delimiter and no spacing. If the
    // parser fell through and left the pipes as literal text, the output would
    // come back byte-identical instead of normalised — which is exactly what
    // the first version of this test failed to notice.
    const cramped = ['|Tracker|Use case|', '|---|---|', '|KIM2|Argos|'].join(
      '\n'
    );
    const out = roundTrip(cramped);
    expect(out).toContain('| Tracker | Use case |');
    expect(out).toContain('| KIM2 | Argos |');
    expect(out).toContain('| --- | --- |');
    expect(out).not.toContain('|Tracker|');
  });

  it('escapes a pipe inside a cell rather than breaking the row', () => {
    const out = roundTrip(
      ['| a | b |', '| --- | --- |', '| x \\| y | z |'].join('\n')
    );
    expect(out).toContain('x \\| y');
  });

  it('does not mistake a horizontal rule for a table delimiter', () => {
    expect(typesOf('text\n\n---\n\nmore')).toContain('horizontalRule');
  });
});

describe('markdownToBlocks — code and diagrams', () => {
  it('keeps the code block language', () => {
    const blocks = Object.values(markdownToBlocks(DOC, '```bash\nls -la\n```'));
    const code = blocks.find((b) => b.type === 'codeBlock')!;
    expect(code.attrs).toMatchObject({ language: 'bash' });
    expect(richTextToMarkdown(DOC, { type: 'rich_text', blocks: markdownToBlocks(DOC, '```bash\nls -la\n```') })).toContain('```bash');
  });

  it('turns a mermaid fence into a real diagram block, not a code block', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '```mermaid\ngraph TD\n  A-->B\n```')
    );
    const diagram = blocks.find((b) => b.type === 'mermaid');
    expect(diagram).toBeDefined();
    expect(diagram!.attrs).toMatchObject({ source: 'graph TD\n  A-->B' });
    expect(blocks.find((b) => b.type === 'codeBlock')).toBeUndefined();
  });

  it('round-trips a diagram back to a mermaid fence', () => {
    const out = roundTrip('```mermaid\ngraph TD\n  A-->B\n```');
    expect(out).toContain('```mermaid');
    expect(out).toContain('graph TD');
  });
});

describe('markdownToBlocks — callouts, headings, lists', () => {
  it('turns a GitHub callout into a callout block with a colour', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '> [!WARNING]\n> mind the gap')
    );
    const callout = blocks.find((b) => b.type === 'callout')!;
    expect(callout.attrs).toMatchObject({ color: 'orange' });
    expect(blocks.find((b) => b.type === 'blockquote')).toBeUndefined();
  });

  it('keeps a plain quote a quote', () => {
    const types = typesOf('> just a quote');
    expect(types).toContain('blockquote');
    expect(types).not.toContain('callout');
  });

  it('clamps a deep heading instead of leaving its hashes as text', () => {
    const blocks = Object.values(markdownToBlocks(DOC, '#### deep'));
    const heading = blocks.find((b) => b.type === 'heading3')!;
    expect(heading).toBeDefined();
    expect(heading.content?.[0]?.text).toBe('deep');
  });

  it('nests an indented list under its parent item', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '- parent\n  - child\n- sibling')
    );
    const lists = blocks.filter((b) => b.type === 'bulletList');
    expect(lists).toHaveLength(2);
    const nested = lists.find((l) => l.parentId !== DOC)!;
    expect(nested).toBeDefined();
    const parentItem = blocks.find((b) => b.id === nested.parentId)!;
    expect(parentItem.type).toBe('listItem');
  });

  it('keeps a flat list flat', () => {
    const blocks = Object.values(markdownToBlocks(DOC, '- one\n- two\n- three'));
    expect(blocks.filter((b) => b.type === 'bulletList')).toHaveLength(1);
    expect(blocks.filter((b) => b.type === 'listItem')).toHaveLength(3);
  });

  it('reads a task list checkbox', () => {
    const blocks = Object.values(markdownToBlocks(DOC, '- [x] done\n- [ ] todo'));
    const items = blocks.filter((b) => b.type === 'taskItem');
    expect(items.map((t) => t.attrs?.checked)).toEqual([true, false]);
  });
});

describe('unrepresentableBlockTypes', () => {
  it('is empty for anything markdown can carry', () => {
    expect(
      unrepresentableBlockTypes(toContent('# title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'))
    ).toEqual([]);
  });

  it('names the blocks a replace would delete', () => {
    const content = {
      type: 'rich_text' as const,
      blocks: {
        b1: { id: 'b1', type: 'database', parentId: DOC, index: 'a0' },
        b2: { id: 'b2', type: 'chart', parentId: DOC, index: 'a1' },
        b3: { id: 'b3', type: 'paragraph', parentId: DOC, index: 'a2' },
      },
    };
    expect(unrepresentableBlockTypes(content)).toEqual(['chart', 'database']);
  });
});
