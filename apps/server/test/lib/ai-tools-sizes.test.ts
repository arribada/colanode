import { describe, expect, it } from 'vitest';

import {
  markdownToBlocks,
  richTextToMarkdown,
} from '@colanode/server/lib/ai/tools';

// A replace edit goes get_page -> markdown -> edit_page, so anything the
// markdown cannot carry is reset. These cover the two sizes it used to drop.

const DOC = 'docsizesdocsizesdocsizespg';
const IMAGE = 'imagefileimagefileimagefi';

type AnyBlock = {
  id: string;
  type: string;
  parentId: string;
  index: string;
  attrs?: Record<string, unknown>;
  content?: { type: string; text?: string }[];
};

const contentOf = (blocks: AnyBlock[]) => ({
  type: 'rich_text' as const,
  blocks: Object.fromEntries(blocks.map((b) => [b.id, b])),
});

const paragraph = (id: string, parentId: string, index: string, text: string): AnyBlock => ({
  id,
  type: 'paragraph',
  parentId,
  index,
  content: [{ type: 'text', text }],
});

const tableWithWidths = (widths: (number | null)[]): AnyBlock[] => {
  const blocks: AnyBlock[] = [
    { id: 'tabletabletabletabletbl', type: 'table', parentId: DOC, index: 'a0', attrs: { colorRules: [] } },
  ];
  ['row0', 'row1'].forEach((row, r) => {
    const rowId = `${row}rowrowrowrowrowrowro`;
    blocks.push({ id: rowId, type: 'tableRow', parentId: 'tabletabletabletabletbl', index: `a${r}` });
    widths.forEach((width, c) => {
      const cellId = `cell${r}${c}cellcellcellcellcel`;
      blocks.push({
        id: cellId,
        type: r === 0 ? 'tableHeader' : 'tableCell',
        parentId: rowId,
        index: `a${c}`,
        attrs: { colspan: 1, rowspan: 1, ...(width ? { colwidth: [width] } : {}) },
      });
      blocks.push(paragraph(`para${r}${c}parapara`, cellId, 'a0', `r${r}c${c}`));
    });
  });
  return blocks;
};

const cellsOf = (blocks: Record<string, AnyBlock>) =>
  Object.values(blocks).filter((b) => b.type === 'tableHeader' || b.type === 'tableCell');

describe('image width', () => {
  it('is written after the image and read back', () => {
    const markdown = richTextToMarkdown(
      DOC,
      contentOf([{ id: IMAGE, type: 'file', parentId: DOC, index: 'a0', attrs: { width: 520 } }]) as never
    );

    expect(markdown).toContain(`![](file:${IMAGE}){width=520}`);
    const back = markdownToBlocks(DOC, markdown) as Record<string, AnyBlock>;
    expect(back[IMAGE]?.attrs?.width).toBe(520);
  });

  it('leaves an image that was never resized exactly as before', () => {
    const markdown = richTextToMarkdown(
      DOC,
      contentOf([{ id: IMAGE, type: 'file', parentId: DOC, index: 'a0' }]) as never
    );

    expect(markdown.trim()).toBe(`![](file:${IMAGE})`);
    const back = markdownToBlocks(DOC, markdown) as Record<string, AnyBlock>;
    expect(back[IMAGE]?.attrs?.width).toBeUndefined();
  });

  it('survives inside a table cell', () => {
    const cellImage = (markdown: string) => {
      const back = markdownToBlocks(DOC, markdown) as Record<string, AnyBlock>;
      return back[IMAGE];
    };
    const markdown = [
      '| a | b |',
      '| --- | --- |',
      `| <p>text</p>![](file:${IMAGE}){width=240} | x |`,
    ].join('\n');

    expect(cellImage(markdown)?.attrs?.width).toBe(240);
  });
});

describe('table column widths', () => {
  it('ride on a comment line above the table and come back on every row', () => {
    const markdown = richTextToMarkdown(DOC, contentOf(tableWithWidths([180, 120])) as never);

    expect(markdown).toContain('<!-- colwidths: 180,120 -->');
    const cells = cellsOf(markdownToBlocks(DOC, markdown) as Record<string, AnyBlock>);
    const widths = cells.map((c) => (c.attrs?.colwidth as number[] | undefined)?.[0]);
    expect(widths.sort()).toEqual([120, 120, 180, 180]);
  });

  it('keep an unset column unset', () => {
    const markdown = richTextToMarkdown(DOC, contentOf(tableWithWidths([180, null])) as never);

    expect(markdown).toContain('<!-- colwidths: 180,- -->');
    const cells = cellsOf(markdownToBlocks(DOC, markdown) as Record<string, AnyBlock>);
    expect(cells.filter((c) => c.attrs?.colwidth === undefined)).toHaveLength(2);
  });

  it('write nothing extra for a table nobody resized', () => {
    const markdown = richTextToMarkdown(DOC, contentOf(tableWithWidths([null, null])) as never);

    expect(markdown).not.toContain('colwidths');
  });

  it('drop a widths line with no table under it instead of showing it', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '<!-- colwidths: 100,200 -->\n\nJust text.') as Record<string, AnyBlock>
    );

    const texts = blocks.flatMap((b) => (b.content ?? []).map((l) => l.text ?? ''));
    expect(texts.join(' ')).not.toContain('colwidths');
    expect(texts.join(' ')).toContain('Just text.');
  });
});
