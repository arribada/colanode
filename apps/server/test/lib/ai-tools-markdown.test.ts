import { describe, expect, it } from 'vitest';

import {
  collectMentionTargets,
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

type TestLeaf = { type: string; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; attrs?: Record<string, unknown> };

const paragraphOf = (leaves: TestLeaf[]) => ({
  type: 'rich_text' as const,
  blocks: {
    p1: { id: 'p1', type: 'paragraph', parentId: DOC, index: 'a0', content: leaves },
  },
});

// Leaves as a reader tells them apart: text and the kinds of marks on it
// (with a link's href), a mention by its target.
const shapeOf = (leaves: TestLeaf[] | null | undefined) =>
  (leaves ?? []).map((leaf) => ({
    type: leaf.type,
    ...(leaf.type === 'mention'
      ? { target: leaf.attrs?.target }
      : { text: leaf.text }),
    marks: (leaf.marks ?? [])
      .map((mark) =>
        mark.type === 'link' ? `link=${String(mark.attrs?.href)}` : mark.type
      )
      .sort(),
  }));

const paragraphBack = (markdown: string) => {
  const blocks = Object.values(markdownToBlocks(DOC, markdown));
  return { types: blocks.map((b) => b.type), leaves: blocks[0]?.content };
};

describe('inline markdown — escaping', () => {
  const literal = [
    'AZURE_ACCOUNT_NAME and _leading and trailing_',
    'a * b * c and 2*3*4',
    'use `npm i` here',
    '[not a link](https://example.org)',
    '# not a heading',
    '1. not a list',
    '12) not a list either',
    '> not a quote',
    '- not a bullet',
    '+ nor this',
    '| not | a | table |',
    '---',
    '___',
    '~~not struck~~',
    '<b>not bold</b> <u>nor underlined</u>',
    'C:\\path\\to\\file and a trailing \\',
    '**not bold** and __not bold__',
    '![not an image](https://example.org/x.png)',
    '```',
  ];

  it('reads plain text back as exactly the same text', () => {
    for (const text of literal) {
      const markdown = richTextToMarkdown(DOC, paragraphOf([{ type: 'text', text }]));
      const back = paragraphBack(markdown);
      expect(back.types, markdown).toEqual(['paragraph']);
      expect(shapeOf(back.leaves), markdown).toEqual([
        { type: 'text', text, marks: [] },
      ]);
    }
  });

  it('leaves identifiers readable', () => {
    expect(
      richTextToMarkdown(DOC, paragraphOf([{ type: 'text', text: 'set AZURE_ACCOUNT_NAME in .env' }]))
    ).toBe('set AZURE_ACCOUNT_NAME in .env');
  });

  it('keeps the ! in front of a link', () => {
    const leaves = [
      { type: 'text', text: 'Look!' },
      { type: 'text', text: 'image', marks: [{ type: 'link', attrs: { href: 'https://example.org/a' } }] },
    ];
    const back = paragraphBack(richTextToMarkdown(DOC, paragraphOf(leaves)));
    expect(shapeOf(back.leaves)).toEqual(shapeOf(leaves));
  });
});

describe('inline markdown — marks', () => {
  const PAGE = '01ky60x9fb8x1856afmmf01sw1pg';
  const link = (href: string) => ({ type: 'link', attrs: { href } });

  it('keeps emphasis on links and mentions', () => {
    const leaves: TestLeaf[] = [
      { type: 'text', text: 'see ' },
      { type: 'text', text: 'docs', marks: [{ type: 'bold' }, link('https://example.org/docs')] },
      { type: 'text', text: ' and ' },
      { type: 'mention', attrs: { id: 'm1me', target: PAGE }, marks: [{ type: 'italic' }] },
    ];
    const markdown = richTextToMarkdown(DOC, paragraphOf(leaves));
    const back = paragraphBack(markdown);
    expect(shapeOf(back.leaves), markdown).toEqual(shapeOf(leaves));
  });

  it('reads a bold link and a bold mention the way people write them', () => {
    const back = paragraphBack(
      `**[docs](https://example.org/docs)** then **[x](node:${PAGE})**`
    );
    expect(shapeOf(back.leaves)).toEqual([
      { type: 'text', text: 'docs', marks: ['bold', 'link=https://example.org/docs'] },
      { type: 'text', text: ' then ', marks: [] },
      { type: 'mention', target: PAGE, marks: ['bold'] },
    ]);
  });

  it('reads the usual emphasis spellings, and leaves words with underscores alone', () => {
    const back = paragraphBack(
      '__bold__ _it_ ***both*** ~~gone~~ snake_case_name 2 * 3 * 4'
    );
    expect(shapeOf(back.leaves)).toEqual([
      { type: 'text', text: 'bold', marks: ['bold'] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'it', marks: ['italic'] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'both', marks: ['bold', 'italic'] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'gone', marks: ['strike'] },
      { type: 'text', text: ' snake_case_name 2 * 3 * 4', marks: [] },
    ]);
  });

  it('round-trips marks that sit side by side', () => {
    const cases: TestLeaf[][] = [
      [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }, { type: 'text', text: 'b', marks: [{ type: 'italic' }] }],
      [{ type: 'text', text: 'a', marks: [{ type: 'italic' }] }, { type: 'text', text: 'b', marks: [{ type: 'bold' }] }],
      [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }, { type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'italic' }] }],
      [{ type: 'text', text: 'a', marks: [{ type: 'strike' }] }, { type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'strike' }] }],
      [{ type: 'text', text: 'foo' }, { type: 'text', text: 'bar', marks: [{ type: 'italic' }] }, { type: 'text', text: 'baz' }],
      [{ type: 'text', text: 'x' }, { type: 'text', text: '(y)', marks: [{ type: 'bold' }] }, { type: 'text', text: 'z' }],
      [{ type: 'text', text: '*', marks: [{ type: 'bold' }] }, { type: 'text', text: '_', marks: [{ type: 'italic' }] }],
      [{ type: 'text', text: 'a`b', marks: [{ type: 'code' }, { type: 'bold' }] }, { type: 'text', text: ' c' }],
    ];
    for (const leaves of cases) {
      const markdown = richTextToMarkdown(DOC, paragraphOf(leaves));
      const back = paragraphBack(markdown);
      expect(shapeOf(back.leaves), markdown).toEqual(shapeOf(leaves));
      // ...and writing what came back gives the same markdown again.
      expect(
        richTextToMarkdown(DOC, { type: 'rich_text', blocks: markdownToBlocks(DOC, markdown) }),
        markdown
      ).toBe(markdown);
    }
  });

  it('does not pair emphasis across a link boundary', () => {
    const back = paragraphBack('[a*b](https://example.org) c*');
    expect(shapeOf(back.leaves)).toEqual([
      { type: 'text', text: 'a*b', marks: ['link=https://example.org'] },
      { type: 'text', text: ' c*', marks: [] },
    ]);
  });

  it('keeps the indentation of an emphasised line', () => {
    const leaves: TestLeaf[] = [
      { type: 'text', text: '\tλ = c / f', marks: [{ type: 'italic' }] },
    ];
    const back = paragraphBack(richTextToMarkdown(DOC, paragraphOf(leaves)));
    expect(shapeOf(back.leaves)).toEqual(shapeOf(leaves));
  });

  it('writes neighbouring leaves with the same marks as one run', () => {
    // The editor stores an italic sentence split around spaces and mentions.
    // Written leaf by leaf it came out as `*a **b*`, which does not read back.
    const leaves: TestLeaf[] = [
      { type: 'text', text: 'Note — it uses a ', marks: [{ type: 'italic' }] },
      { type: 'text', text: 'RunCam', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' module.', marks: [{ type: 'italic' }] },
    ];
    expect(richTextToMarkdown(DOC, paragraphOf(leaves))).toBe(
      '*Note — it uses a RunCam module.*'
    );
  });

  it('writes a link address with spaces or parentheses so it reads back whole', () => {
    for (const href of ['https://en.wikipedia.org/wiki/Loggerhead_(turtle)', 'https://example.org/a b']) {
      const leaves = [{ type: 'text', text: 'here', marks: [link(href)] }];
      const back = paragraphBack(richTextToMarkdown(DOC, paragraphOf(leaves)));
      expect(shapeOf(back.leaves), href).toEqual(shapeOf(leaves));
    }
  });
});

describe('inline markdown — colour, highlight, underline, comments', () => {
  const PAGE = '01ky60x9fb8x1856afmmf01sw1pg';
  const THREAD = '01m077kqhhgrnz2y9gr5vdrb0vcm';
  const red = { type: 'color', attrs: { color: 'red' } };
  const blue = { type: 'highlight', attrs: { highlight: 'blue' } };
  const underline = { type: 'underline' };
  const comment = { type: 'comment', attrs: { threadId: THREAD } };
  const link = { type: 'link', attrs: { href: 'https://www.digikey.fr/p/KXOB25' } };

  // shapeOf, with the value each of these marks carries.
  const styled = (leaves: TestLeaf[] | null | undefined) =>
    (leaves ?? []).map((leaf) => ({
      ...shapeOf([leaf])[0],
      marks: (leaf.marks ?? [])
        .map((mark) => {
          const value = mark.attrs?.color ?? mark.attrs?.highlight ?? mark.attrs?.threadId ?? mark.attrs?.href;
          return value === undefined ? mark.type : `${mark.type}=${String(value)}`;
        })
        .sort(),
    }));

  it('round-trips the marks markdown has no syntax for', () => {
    const cases: TestLeaf[][] = [
      [
        { type: 'text', text: '🔴 TO BE DEFINED — 1 open item', marks: [{ type: 'bold' }, red] },
        { type: 'text', text: ' · Owner: Geoffrey' },
      ],
      [
        { type: 'text', text: 'use the menu to change ' },
        { type: 'text', text: 'colors', marks: [blue] },
      ],
      [{ type: 'text', text: ' KXOB25-03X4F', marks: [{ type: 'bold' }, underline, link] }],
      [
        { type: 'text', text: 'Solder battery wire to J7 ', marks: [comment] },
        { type: 'text', text: 'now', marks: [comment, { type: 'italic' }] },
      ],
      [
        { type: 'text', text: 'owner ' },
        { type: 'mention', attrs: { id: 'm1me', target: PAGE }, marks: [red] },
      ],
      [{ type: 'text', text: '+ Enclosure available', marks: [underline] }],
    ];
    for (const leaves of cases) {
      const markdown = richTextToMarkdown(DOC, paragraphOf(leaves));
      const back = paragraphBack(markdown);
      expect(back.types, markdown).toEqual(['paragraph']);
      expect(styled(back.leaves), markdown).toEqual(styled(leaves));
    }
  });

  it('writes them as the tags the editor uses', () => {
    expect(
      richTextToMarkdown(
        DOC,
        paragraphOf([{ type: 'text', text: 'TO BE DEFINED', marks: [{ type: 'bold' }, red] }])
      )
    ).toBe('<span data-color="red">**TO BE DEFINED**</span>');
  });

  it('closes a span against the nearest open one', () => {
    const back = paragraphBack(
      `<span data-color="red">a <span data-comment="${THREAD}">b</span> c</span>`
    );
    expect(styled(back.leaves)).toEqual([
      { type: 'text', text: 'a ', marks: ['color=red'] },
      { type: 'text', text: 'b', marks: ['color=red', `comment=${THREAD}`] },
      { type: 'text', text: ' c', marks: ['color=red'] },
    ]);
  });

  it('leaves the tag a closer does not match as text', () => {
    // </span> ends the span, not the <u> opened inside it; that <u> is then
    // never closed and stays literal, as does the stray </u>.
    const back = paragraphBack('<span data-color="red">a <u>b</span> c</u>');
    expect(styled(back.leaves)).toEqual([
      { type: 'text', text: 'a <u>b', marks: ['color=red'] },
      { type: 'text', text: ' c</u>', marks: [] },
    ]);
  });

  it('does not merge two runs of different colours', () => {
    const leaves: TestLeaf[] = [
      { type: 'text', text: 'red', marks: [{ type: 'color', attrs: { color: 'red' } }] },
      { type: 'text', text: 'green', marks: [{ type: 'color', attrs: { color: 'green' } }] },
    ];
    const back = paragraphBack(richTextToMarkdown(DOC, paragraphOf(leaves)));
    expect(styled(back.leaves)).toEqual(styled(leaves));
  });

  it('keeps any other tag, or a value it does not know, as literal text', () => {
    for (const text of [
      '<script>alert(1)</script>',
      '<span data-color="javascript:alert(1)">a</span>',
      '<span onclick="x">a</span>',
      '<span>a</span> <mark>b</mark>',
      '<span data-comment="not an id">a</span>',
      '<img src=x onerror=alert(1)>',
    ]) {
      const back = paragraphBack(text);
      expect(styled(back.leaves), text).toEqual([{ type: 'text', text, marks: [] }]);
    }
  });
});

describe('hard line breaks', () => {
  const br = { type: 'hardBreak' };
  const text = (value: string): TestLeaf => ({ type: 'text', text: value });

  it('writes a break as a backslash at the end of the line and reads it back', () => {
    const leaves = [text('line one'), br, text('line two')];
    const markdown = richTextToMarkdown(DOC, paragraphOf(leaves));
    expect(markdown).toBe('line one\\\nline two');
    const back = paragraphBack(markdown);
    expect(back.types).toEqual(['paragraph']);
    expect(shapeOf(back.leaves)).toEqual(shapeOf(leaves));
  });

  it('keeps trailing and repeated breaks, and a next line that looks like a block', () => {
    const cases: TestLeaf[][] = [
      [text('Price difference is minor.'), br],
      [br, br],
      [text('a'), br, br, text('b')],
      [text('Steps'), br, text('# not a heading'), br, text('- not a bullet'), br, text('1. nor a list')],
      [text('Commit reviewed : 987b249i'), br, { type: 'text', text: 'bold next', marks: [{ type: 'bold' }] }],
    ];
    for (const leaves of cases) {
      const markdown = richTextToMarkdown(DOC, paragraphOf(leaves));
      const back = paragraphBack(markdown);
      expect(back.types, markdown).toEqual(['paragraph']);
      expect(shapeOf(back.leaves), markdown).toEqual(shapeOf(leaves));
    }
  });

  it('escapes a block marker on the line after a break, as CommonMark needs', () => {
    // CommonMark lets a heading or a list interrupt a paragraph, so another
    // renderer would split these lines off without the escapes.
    const markdown = richTextToMarkdown(
      DOC,
      paragraphOf([text('Steps'), br, text('# one'), br, text('- two'), br, text('3. three')])
    );
    expect(markdown).toBe('Steps\\\n\\# one\\\n\\- two\\\n3\\. three');
  });

  it('keeps a literal backslash at the end of a line a backslash', () => {
    const content = {
      type: 'rich_text' as const,
      blocks: {
        p1: { id: 'p1', type: 'paragraph', parentId: DOC, index: 'a0', content: [text('C:\\')] },
        p2: { id: 'p2', type: 'paragraph', parentId: DOC, index: 'a1', content: [text('next')] },
      },
    };
    const blocks = Object.values(
      markdownToBlocks(DOC, richTextToMarkdown(DOC, content))
    ).sort((a, b) => (a.index < b.index ? -1 : 1));
    expect(blocks.map((b) => shapeOf(b.content))).toEqual([
      shapeOf([text('C:\\')]),
      shapeOf([text('next')]),
    ]);
  });

  it('keeps a break in a heading', () => {
    const markdown = richTextToMarkdown(DOC, {
      type: 'rich_text',
      blocks: {
        h1: { id: 'h1', type: 'heading2', parentId: DOC, index: 'a0', content: [text('4.1 Block diagram'), br, text('and more')] },
      },
    });
    const blocks = Object.values(markdownToBlocks(DOC, markdown));
    expect(blocks.map((b) => b.type), markdown).toEqual(['heading2']);
    expect(shapeOf(blocks[0]!.content)).toEqual(shapeOf([text('4.1 Block diagram'), br, text('and more')]));
  });

  it('writes a break inside a table cell as <br>, and reads <br> anywhere', () => {
    const markdown = richTextToMarkdown(DOC, {
      type: 'rich_text',
      blocks: {
        t: { id: 't', type: 'table', parentId: DOC, index: 'a0' },
        r0: { id: 'r0', type: 'tableRow', parentId: 't', index: 'a0' },
        h0: { id: 'h0', type: 'tableHeader', parentId: 'r0', index: 'a0' },
        hp: { id: 'hp', type: 'paragraph', parentId: 'h0', index: 'a0', content: [text('Pin')] },
        r1: { id: 'r1', type: 'tableRow', parentId: 't', index: 'a1' },
        c0: { id: 'c0', type: 'tableCell', parentId: 'r1', index: 'a0' },
        cp: { id: 'cp', type: 'paragraph', parentId: 'c0', index: 'a0', content: [text('VBAT'), br, text('3.7 V')] },
      },
    });
    expect(markdown).toContain('| VBAT<br>3.7 V |');
    const cell = Object.values(markdownToBlocks(DOC, markdown)).find(
      (b) => b.type === 'paragraph' && (b.content ?? []).some((l) => l.type === 'hardBreak')
    );
    expect(shapeOf(cell?.content)).toEqual(shapeOf([text('VBAT'), br, text('3.7 V')]));

    expect(shapeOf(paragraphBack('a<br>b<br/>c<br />d').leaves)).toEqual(
      shapeOf([text('a'), br, text('b'), br, text('c'), br, text('d')])
    );
  });

  it('writes a newline stored inside text as a break', () => {
    const back = paragraphBack(
      richTextToMarkdown(DOC, paragraphOf([text('first\nsecond')]))
    );
    expect(back.types).toEqual(['paragraph']);
    expect(shapeOf(back.leaves)).toEqual(shapeOf([text('first'), br, text('second')]));
  });
});

type TestBlock = {
  id: string;
  type: string;
  parentId: string;
  index: string;
  attrs?: Record<string, unknown> | null;
  content?: TestLeaf[] | null;
};

// The block tree under a parent: type, plain text, children, in order.
type TreeNode = { type: string; text: string; children: TreeNode[] };
const treeOf = (
  blocks: Record<string, TestBlock>,
  parentId: string = DOC
): TreeNode[] =>
  Object.values(blocks)
    .filter((block) => block.parentId === parentId)
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
    .map((block) => ({
      type: block.type,
      text: (block.content ?? [])
        .map((leaf) => (leaf.type === 'hardBreak' ? '\n' : (leaf.text ?? '')))
        .join(''),
      children: treeOf(blocks, block.id),
    }));

const textBlock = (
  id: string,
  parentId: string,
  index: string,
  text: string,
  type = 'paragraph'
): TestBlock => ({
  id,
  type,
  parentId,
  index,
  content: [{ type: 'text', text }],
});

const container = (
  id: string,
  type: string,
  parentId: string,
  index: string,
  attrs?: Record<string, unknown>
): TestBlock => ({ id, type, parentId, index, ...(attrs ? { attrs } : {}) });

const byId = (...list: TestBlock[]) =>
  Object.fromEntries(list.map((block) => [block.id, block]));

const treeRoundTrip = (blocks: Record<string, TestBlock>) => {
  const markdown = richTextToMarkdown(DOC, {
    type: 'rich_text',
    blocks: blocks as never,
  });
  return {
    markdown,
    tree: treeOf(markdownToBlocks(DOC, markdown) as never),
  };
};

describe('blocks written one after another', () => {
  it('keeps a callout, another callout and a quote apart', () => {
    const blocks = byId(
      container('c1', 'callout', DOC, 'a0', { color: 'red' }),
      textBlock('p1', 'c1', 'a0', 'first'),
      container('c2', 'callout', DOC, 'a1', { color: 'blue' }),
      textBlock('p2', 'c2', 'a0', 'second'),
      container('q1', 'blockquote', DOC, 'a2'),
      textBlock('p3', 'q1', 'a0', 'quoted')
    );
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
  });

  it('ends a table before a line with a pipe and before the next table', () => {
    const table = (id: string, index: string, cells: [string, string]) => [
      container(id, 'table', DOC, index),
      container(`${id}r0`, 'tableRow', id, 'a0'),
      container(`${id}h0`, 'tableHeader', `${id}r0`, 'a0'),
      textBlock(`${id}h0p`, `${id}h0`, 'a0', cells[0]),
      container(`${id}r1`, 'tableRow', id, 'a1'),
      container(`${id}c0`, 'tableCell', `${id}r1`, 'a0'),
      textBlock(`${id}c0p`, `${id}c0`, 'a0', cells[1]),
    ];
    const blocks = byId(
      ...table('t1', 'a0', ['Pin', 'VBAT']),
      textBlock('p1', DOC, 'a1', 'a | b'),
      ...table('t2', 'a2', ['Error State', 'none']),
      ...table('t3', 'a3', ['Driver status', 'ok'])
    );
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
  });

  it('keeps two lists in a row two lists', () => {
    const blocks = byId(
      container('l1', 'bulletList', DOC, 'a0'),
      container('i1', 'listItem', 'l1', 'a0'),
      textBlock('i1p', 'i1', 'a0', 'one'),
      container('l2', 'bulletList', DOC, 'a1'),
      container('i2', 'listItem', 'l2', 'a0'),
      textBlock('i2p', 'i2', 'a0', 'two')
    );
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
  });

  it('reads anything a page holds inside a callout or a quote', () => {
    const blocks = byId(
      container('c1', 'callout', DOC, 'a0', { color: 'orange' }),
      textBlock('p1', 'c1', 'a0', 'Before you flash:'),
      textBlock('p2', 'c1', 'a1', 'check the battery.'),
      container('l1', 'bulletList', 'c1', 'a2'),
      container('i1', 'listItem', 'l1', 'a0'),
      textBlock('i1p', 'i1', 'a0', 'charged'),
      container('i2', 'listItem', 'l1', 'a1'),
      textBlock('i2p', 'i2', 'a0', 'connected'),
      {
        ...textBlock('code', 'c1', 'a3', 'west flash\n  --runner nrfjprog', 'codeBlock'),
        attrs: { language: 'bash' },
      },
      container('q1', 'blockquote', 'c1', 'a4'),
      textBlock('q1p', 'q1', 'a0', 'quoted inside')
    );
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
  });

  it('keeps empty paragraphs, in a page, a callout and a list item', () => {
    const empty = (id: string, parentId: string, index: string): TestBlock => ({
      id,
      type: 'paragraph',
      parentId,
      index,
      content: [],
    });
    const blocks = byId(
      textBlock('p1', DOC, 'a0', 'first'),
      empty('e1', DOC, 'a1'),
      empty('e2', DOC, 'a2'),
      textBlock('p2', DOC, 'a3', 'second'),
      container('c1', 'callout', DOC, 'a4', { color: 'blue' }),
      textBlock('c1a', 'c1', 'a0', 'Scope.'),
      empty('c1b', 'c1', 'a1'),
      textBlock('c1c', 'c1', 'a2', 'Read the whole page.'),
      container('l1', 'bulletList', DOC, 'a5'),
      container('i1', 'listItem', 'l1', 'a0'),
      empty('i1p', 'i1', 'a0')
    );
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
  });

  it('reads <p></p> as written text when it is part of a sentence', () => {
    const back = paragraphBack(
      richTextToMarkdown(DOC, paragraphOf([{ type: 'text', text: '<p></p>' }]))
    );
    expect(shapeOf(back.leaves)).toEqual([
      { type: 'text', text: '<p></p>', marks: [] },
    ]);
  });

  it('gives an empty quote or callout the paragraph the editor needs', () => {
    for (const markdown of ['>', '> [!NOTE]']) {
      const tree = treeOf(markdownToBlocks(DOC, markdown) as never);
      expect(tree, markdown).toHaveLength(1);
      expect(tree[0]!.children.map((child) => child.type), markdown).toEqual([
        'paragraph',
      ]);
    }
  });

  it('refuses markdown nested deeper than it reads', () => {
    expect(() => markdownToBlocks(DOC, `${'>'.repeat(200)} deep`)).toThrow(
      /levels deep/
    );
  });
});

describe('lists', () => {
  const FILE = '01m077hpdmt396qc9n0z5zb5n1fi';
  const list = (id: string, type: string, parentId: string, index: string, attrs?: Record<string, unknown>) =>
    container(id, type, parentId, index, attrs);
  const item = (id: string, parentId: string, index: string, type = 'listItem', attrs?: Record<string, unknown>) =>
    container(id, type, parentId, index, attrs);

  const expectRoundTrip = (blocks: Record<string, TestBlock>) => {
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
    return markdown;
  };

  it('keeps a second paragraph, an image and a code block inside their item', () => {
    expectRoundTrip(
      byId(
        list('l1', 'orderedList', DOC, 'a0'),
        item('i1', 'l1', 'a0'),
        textBlock('i1a', 'i1', 'a0', 'Solder the battery wire to J7.'),
        { id: FILE, type: 'file', parentId: 'i1', index: 'a1' },
        textBlock('i1b', 'i1', 'a2', 'Then check the polarity.'),
        {
          ...textBlock('i1c', 'i1', 'a3', 'west build -b rspb\n  --pristine\n\n# done', 'codeBlock'),
          attrs: { language: 'bash' },
        },
        item('i2', 'l1', 'a1'),
        textBlock('i2a', 'i2', 'a0', 'Close the lid.')
      )
    );
  });

  it('writes code inside an item without adding indentation to it', () => {
    const markdown = expectRoundTrip(
      byId(
        list('l1', 'bulletList', DOC, 'a0'),
        item('i1', 'l1', 'a0'),
        textBlock('i1a', 'i1', 'a0', 'Run:'),
        {
          ...textBlock('i1b', 'i1', 'a1', 'make\n    flash', 'codeBlock'),
          attrs: { language: 'plaintext' },
        }
      )
    );
    expect(markdown).toBe('- Run:\n  ```\n  make\n      flash\n  ```');
  });

  it('keeps the number an ordered list starts at', () => {
    const blocks = byId(
      list('l1', 'orderedList', DOC, 'a0', { start: 11 }),
      item('i1', 'l1', 'a0'),
      textBlock('i1a', 'i1', 'a0', 'eleventh'),
      item('i2', 'l1', 'a1'),
      textBlock('i2a', 'i2', 'a0', 'twelfth')
    );
    const markdown = expectRoundTrip(blocks);
    expect(markdown).toBe('11. eleventh\n12. twelfth');
    const back = Object.values(markdownToBlocks(DOC, markdown));
    expect(back.find((b) => b.type === 'orderedList')?.attrs).toMatchObject({ start: 11 });
  });

  it('nests lists of every kind, with breaks and containers inside items', () => {
    expectRoundTrip(
      byId(
        list('l1', 'bulletList', DOC, 'a0'),
        item('i1', 'l1', 'a0'),
        { ...textBlock('i1a', 'i1', 'a0', ''), content: [{ type: 'text', text: 'line one' }, { type: 'hardBreak' }, { type: 'text', text: 'line two' }] },
        list('l2', 'orderedList', 'i1', 'a1'),
        item('i2', 'l2', 'a0'),
        textBlock('i2a', 'i2', 'a0', 'C:\\'),
        list('l3', 'taskList', 'i2', 'a1'),
        item('i3', 'l3', 'a0', 'taskItem', { checked: true }),
        textBlock('i3a', 'i3', 'a0', 'done'),
        container('q1', 'blockquote', 'i1', 'a2'),
        textBlock('q1a', 'q1', 'a0', 'quoted in the item'),
        textBlock('i1b', 'i1', 'a3', 'after the quote'),
        item('i4', 'l1', 'a1'),
        textBlock('i4a', 'i4', 'a0', 'second item')
      )
    );
  });

  it('keeps two quotes or two lists in a row apart inside an item', () => {
    expectRoundTrip(
      byId(
        list('l1', 'bulletList', DOC, 'a0'),
        item('i1', 'l1', 'a0'),
        textBlock('i1a', 'i1', 'a0', 'first'),
        container('q1', 'blockquote', 'i1', 'a1'),
        textBlock('q1p', 'q1', 'a0', 'one quote'),
        container('q2', 'blockquote', 'i1', 'a2'),
        textBlock('q2p', 'q2', 'a0', 'another quote'),
        list('n1', 'bulletList', 'i1', 'a3'),
        item('n1i', 'n1', 'a0'),
        textBlock('n1p', 'n1i', 'a0', 'one list'),
        list('n2', 'bulletList', 'i1', 'a4'),
        item('n2i', 'n2', 'a0'),
        textBlock('n2p', 'n2i', 'a0', 'another list')
      )
    );
  });

  it('keeps an empty item', () => {
    expectRoundTrip(
      byId(
        list('l1', 'bulletList', DOC, 'a0'),
        item('i1', 'l1', 'a0'),
        { id: 'i1a', type: 'paragraph', parentId: 'i1', index: 'a0', content: [] },
        item('i2', 'l1', 'a1'),
        textBlock('i2a', 'i2', 'a0', 'next')
      )
    );
  });

  it('keeps a table that is the first thing in an item', () => {
    expectRoundTrip(
      byId(
        list('l1', 'bulletList', DOC, 'a0'),
        item('i1', 'l1', 'a0'),
        container('t', 'table', 'i1', 'a0'),
        container('r0', 'tableRow', 't', 'a0'),
        container('h0', 'tableHeader', 'r0', 'a0'),
        textBlock('h0p', 'h0', 'a0', 'Pin'),
        container('r1', 'tableRow', 't', 'a1'),
        container('c0', 'tableCell', 'r1', 'a0'),
        textBlock('c0p', 'c0', 'a0', 'VBAT'),
        textBlock('i1p', 'i1', 'a1', 'after the table')
      )
    );
  });

  it('reads what people write: another kind of marker, a bare marker', () => {
    expect(
      treeOf(markdownToBlocks(DOC, '- a\n- [ ] b\n1. c') as never).map((n) => n.type)
    ).toEqual(['bulletList', 'taskList', 'orderedList']);

    const bare = treeOf(markdownToBlocks(DOC, '-\n- b') as never);
    expect(bare).toHaveLength(1);
    expect(bare[0]!.children.map((child) => child.children.map((c) => [c.type, c.text]))).toEqual([
      [['paragraph', '']],
      [['paragraph', 'b']],
    ]);
  });

  it('reads the nesting people write, two spaces under a numbered item', () => {
    const tree = treeOf(markdownToBlocks(DOC, '1. a\n  - b\n2. c') as never);
    expect(tree).toEqual([
      {
        type: 'orderedList',
        text: '',
        children: [
          {
            type: 'listItem',
            text: '',
            children: [
              { type: 'paragraph', text: 'a', children: [] },
              {
                type: 'bulletList',
                text: '',
                children: [
                  { type: 'listItem', text: '', children: [{ type: 'paragraph', text: 'b', children: [] }] },
                ],
              },
            ],
          },
          { type: 'listItem', text: '', children: [{ type: 'paragraph', text: 'c', children: [] }] },
        ],
      },
    ]);
  });
});

describe('table cells', () => {
  const IMAGE = '01kzbt4zt38teyamczph8kq65ffi';

  const tableWith = (cellChildren: TestBlock[]) =>
    byId(
      container('t', 'table', DOC, 'a0'),
      container('r0', 'tableRow', 't', 'a0'),
      container('h0', 'tableHeader', 'r0', 'a0'),
      textBlock('h0p', 'h0', 'a0', 'Review note'),
      container('r1', 'tableRow', 't', 'a1'),
      container('c0', 'tableCell', 'r1', 'a0'),
      ...cellChildren
    );

  it('keeps several paragraphs and an image in one cell', () => {
    const blocks = tableWith([
      textBlock('c0a', 'c0', 'a0', 'U7 needs 4.7uF + 100nF | per pin, not </p> literally.'),
      { id: IMAGE, type: 'file', parentId: 'c0', index: 'a1' },
      {
        ...textBlock('c0b', 'c0', 'a2', ''),
        content: [
          { type: 'text', text: 'Check the ' },
          { type: 'text', text: '</p>', marks: [{ type: 'code' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'datasheet' },
        ],
      },
    ]);
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
    const back = markdownToBlocks(DOC, markdown);
    expect(back[IMAGE]?.type).toBe('file');
    expect(back[back[IMAGE]!.parentId]?.type).toBe('tableCell');
  });

  it('gives an empty cell its paragraph back', () => {
    const blocks = tableWith([
      { id: 'c0a', type: 'paragraph', parentId: 'c0', index: 'a0', content: [] },
    ]);
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
  });

  it('writes a cell of one paragraph as its text', () => {
    const { markdown, tree } = treeRoundTrip(
      tableWith([textBlock('c0a', 'c0', 'a0', '<p>not a paragraph tag</p>')])
    );
    expect(markdown).toContain('| \\<p>not a paragraph tag\\</p> |');
    expect(tree[0]!.children[1]!.children[0]!.children).toEqual([
      { type: 'paragraph', text: '<p>not a paragraph tag</p>', children: [] },
    ]);
  });

  it('reads paragraphs and images that people write into a cell', () => {
    const markdown = `| a |\n| --- |\n| <p>one</p> ![](file:${IMAGE}) <p>two</p> |`;
    const tree = treeOf(markdownToBlocks(DOC, markdown) as never);
    expect(tree[0]!.children[1]!.children[0]!.children.map((c) => [c.type, c.text])).toEqual([
      ['paragraph', 'one'],
      ['file', ''],
      ['paragraph', 'two'],
    ]);
  });
});

describe('markdownToBlocks — tables', () => {
  const table = [
    '| Tracker | Use case |',
    '| --- | --- |',
    '| KIM2 | Argos |',
  ].join('\n');

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
    expect(headerCells.map((c) => c.type)).toEqual([
      'tableHeader',
      'tableHeader',
    ]);
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

  it('does not read a rule after a line containing a pipe as a table', () => {
    // Caught on a real page: a paragraph mentioning "a | b" followed by a rule
    // was swallowed as a one-row table, turning 57 tables into 58. A delimiter
    // has to contain a pipe of its own.
    const types = typesOf('see the a | b column\n---\nnext');
    expect(types).not.toContain('table');
    expect(types).toContain('horizontalRule');
  });
});

describe('markdownToBlocks — code and diagrams', () => {
  it('keeps the code block language', () => {
    const blocks = Object.values(markdownToBlocks(DOC, '```bash\nls -la\n```'));
    const code = blocks.find((b) => b.type === 'codeBlock')!;
    expect(code.attrs).toMatchObject({ language: 'bash' });
    expect(
      richTextToMarkdown(DOC, {
        type: 'rich_text',
        blocks: markdownToBlocks(DOC, '```bash\nls -la\n```'),
      })
    ).toContain('```bash');
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

  it('fences code that itself contains a fence with a longer one', () => {
    // A code block documenting markdown: its ``` line used to close the
    // fence, and the rest of the code spilled out as paragraphs.
    const code = 'Write:\n```js\nconst a = 1;\n```\nthen ````nested````.';
    const markdown = richTextToMarkdown(DOC, {
      type: 'rich_text',
      blocks: {
        c1: {
          id: 'c1',
          type: 'codeBlock',
          parentId: DOC,
          index: 'a0',
          attrs: { language: 'markdown' },
          content: [{ type: 'text', text: code }],
        },
        p1: {
          id: 'p1',
          type: 'paragraph',
          parentId: DOC,
          index: 'a1',
          content: [{ type: 'text', text: 'after' }],
        },
      },
    });
    expect(markdown.split('\n')[0]).toBe('`````markdown');

    const back = Object.values(markdownToBlocks(DOC, markdown)).sort((a, b) =>
      a.index < b.index ? -1 : 1
    );
    expect(back.map((b) => b.type)).toEqual(['codeBlock', 'paragraph']);
    expect(back[0]!.content?.[0]?.text).toBe(code);
    expect(back[0]!.attrs).toMatchObject({ language: 'markdown' });
  });

  it('does not close a fence on a longer info line or a shorter fence', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '````\n```js\n```\n````')
    );
    expect(blocks.map((b) => b.type)).toEqual(['codeBlock']);
    expect(blocks[0]!.content?.[0]?.text).toBe('```js\n```');
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

  it('keeps a callout colour and icon through a round-trip, for the whole palette', () => {
    const palette = [
      'default',
      'gray',
      'blue',
      'green',
      'yellow',
      'orange',
      'red',
      'purple',
      'pink',
    ];
    for (const color of palette) {
      for (const icon of [null, '01jz5p1fe3m7c4x0v2k9bq8r6tem']) {
        const attrs = icon ? { color, icon } : { color };
        const markdown = richTextToMarkdown(DOC, {
          type: 'rich_text',
          blocks: {
            c1: {
              id: 'c1',
              type: 'callout',
              parentId: DOC,
              index: 'a0',
              attrs,
            },
            p1: {
              id: 'p1',
              type: 'paragraph',
              parentId: 'c1',
              index: 'a0',
              content: [{ type: 'text', text: 'Mind the gap' }],
            },
          },
        });

        const blocks = Object.values(markdownToBlocks(DOC, markdown));
        const top = blocks.filter((b) => b.parentId === DOC);
        const label = `${color}${icon ? ' + icon' : ''}: ${markdown}`;
        expect(
          top.map((b) => b.type),
          label
        ).toEqual(['callout']);
        expect(top[0]!.attrs, label).toEqual(attrs);
        expect(
          blocks
            .filter((b) => b.parentId === top[0]!.id)
            .map((b) => b.content?.[0]?.text),
          label
        ).toEqual(['Mind the gap']);
      }
    }
  });

  it('no longer writes the colour as a line of text', () => {
    // A red callout came back blue, with a paragraph reading "red" in it.
    const markdown = richTextToMarkdown(DOC, {
      type: 'rich_text',
      blocks: {
        c1: {
          id: 'c1',
          type: 'callout',
          parentId: DOC,
          index: 'a0',
          attrs: { color: 'red' },
        },
        p1: {
          id: 'p1',
          type: 'paragraph',
          parentId: 'c1',
          index: 'a0',
          content: [{ type: 'text', text: 'Do not flash over the air' }],
        },
      },
    });
    expect(markdown).toBe('> [!CAUTION]\n> Do not flash over the air');
    const texts = Object.values(markdownToBlocks(DOC, markdown)).map(
      (b) => b.content?.[0]?.text
    );
    expect(texts).not.toContain('red');
  });

  it('reads the common alert aliases', () => {
    for (const [keyword, color] of [
      ['INFO', 'blue'],
      ['SUCCESS', 'green'],
      ['CAUTION', 'red'],
      ['DANGER', 'red'],
      ['ERROR', 'red'],
      ['SOMETHING', 'default'],
    ] as const) {
      const callout = Object.values(
        markdownToBlocks(DOC, `> [!${keyword}]\n> text`)
      ).find((b) => b.type === 'callout');
      expect(callout?.attrs, keyword).toEqual({ color });
    }
  });

  it('keeps a plain quote a quote', () => {
    const types = typesOf('> just a quote');
    expect(types).toContain('blockquote');
    expect(types).not.toContain('callout');
  });

  it('maps four and five hashes to the matching heading level', () => {
    for (const [hashes, type] of [
      ['####', 'heading4'],
      ['#####', 'heading5'],
    ] as const) {
      const blocks = Object.values(markdownToBlocks(DOC, `${hashes} deep`));
      const heading = blocks.find((b) => b.type === type);
      expect(heading, type).toBeDefined();
      expect(heading?.content?.[0]?.text).toBe('deep');
    }
  });

  it('keeps a heading that has no text yet a heading', () => {
    const blocks = byId(
      textBlock('h1', DOC, 'a0', '', 'heading2'),
      textBlock('p1', DOC, 'a1', 'below')
    );
    blocks.h1!.content = [];
    const { markdown, tree } = treeRoundTrip(blocks);
    expect(tree, markdown).toEqual(treeOf(blocks));
    // ...while a hash with text glued to it is still text.
    expect(treeOf(markdownToBlocks(DOC, '#hashtag') as never)[0]?.type).toBe(
      'paragraph'
    );
  });

  it('lands a sixth level on the fifth instead of leaving its hashes as text', () => {
    const blocks = Object.values(markdownToBlocks(DOC, '###### deeper'));
    expect(blocks.find((b) => b.type === 'heading5')?.content?.[0]?.text).toBe(
      'deeper'
    );
  });

  it('round-trips the deeper heading levels', () => {
    const out = roundTrip('#### four\n\n##### five');
    expect(out).toContain('#### four');
    expect(out).toContain('##### five');
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
    const blocks = Object.values(
      markdownToBlocks(DOC, '- one\n- two\n- three')
    );
    expect(blocks.filter((b) => b.type === 'bulletList')).toHaveLength(1);
    expect(blocks.filter((b) => b.type === 'listItem')).toHaveLength(3);
  });

  it('reads a task list checkbox', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '- [x] done\n- [ ] todo')
    );
    const items = blocks.filter((b) => b.type === 'taskItem');
    expect(items.map((t) => t.attrs?.checked)).toEqual([true, false]);
  });
});

describe('unrepresentableBlockTypes', () => {
  it('is empty for anything markdown can carry', () => {
    expect(
      unrepresentableBlockTypes(
        toContent('# title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |')
      )
    ).toEqual([]);
  });

  it('names the blocks a replace would delete', () => {
    const content = {
      type: 'rich_text' as const,
      blocks: {
        b1: { id: 'b1', type: 'database', parentId: DOC, index: 'a0' },
        b2: { id: 'b2', type: 'chart', parentId: DOC, index: 'a1' },
        b3: { id: 'b3', type: 'paragraph', parentId: DOC, index: 'a2' },
        b4: { id: 'b4', type: 'page', parentId: DOC, index: 'a3' },
        b5: { id: 'b5', type: 'paragraph', parentId: 'b4', index: 'a0' },
      },
    };
    // An embedded database now travels as a fence; a page block with children
    // inside it is still more than a fence can hold.
    expect(unrepresentableBlockTypes(content)).toEqual(['chart', 'page']);
  });
});

describe('embedded blocks', () => {
  const ADR_DB = '01kz65zq0tcwrjsry61cw4sf4pdb';
  const WHITEBOARD = '01m1xfh2s2xxv7rhdbn2gbm08wwb';
  const SUB_PAGE = '01m1ndcs1x158s41y5ach5cnq0pg';
  const adrAttrs = {
    inline: true,
    filterValue: '01kz65zq0tcwrjsry61cw4sf46so',
    filterFieldId: '01kz65zq0tcwrjsry61cw4sf4rfd',
  };

  it('round-trips the ADR page view of the ADR database, filter included', () => {
    // The block as it is stored on the ADR page.
    const content = {
      type: 'rich_text' as const,
      blocks: {
        p0: {
          id: 'p0',
          type: 'paragraph',
          parentId: DOC,
          index: 'a0',
          content: [{ type: 'text', text: 'Decisions' }],
        },
        [ADR_DB]: {
          id: ADR_DB,
          type: 'database',
          parentId: DOC,
          index: 'a1',
          attrs: adrAttrs,
        },
      },
    };

    const markdown = richTextToMarkdown(DOC, content, {
      embedHints: new Map([
        [ADR_DB, { _name: '🧭 ADR', _filter: 'Project = 📸 Insight 360' }],
      ]),
    });
    // A blank line separates blocks, so neither can run into the other.
    expect(markdown).toBe(
      [
        'Decisions',
        '',
        '```colanode-database',
        JSON.stringify({
          id: ADR_DB,
          inline: true,
          filterFieldId: adrAttrs.filterFieldId,
          filterValue: adrAttrs.filterValue,
          _name: '🧭 ADR',
          _filter: 'Project = 📸 Insight 360',
        }),
        '```',
      ].join('\n')
    );

    const back = markdownToBlocks(DOC, markdown);
    expect(back[ADR_DB]).toMatchObject({
      id: ADR_DB,
      type: 'database',
      parentId: DOC,
    });
    // The hints are gone, the attributes are exactly what was stored.
    expect(back[ADR_DB]!.attrs).toEqual(adrAttrs);
    expect(unrepresentableBlockTypes(content)).toEqual([]);
  });

  it('round-trips a whiteboard view, a sub-page and a web embed', () => {
    const region = {
      x: -202.73979955177447,
      y: -31.50204770183541,
      zoom: 0.42,
    };
    const embedAttrs = {
      url: 'https://docs.google.com/spreadsheets/d/1Sil/edit?gid=0#gid=0',
      provider: 'google-sheets',
    };
    const markdown = richTextToMarkdown(DOC, {
      type: 'rich_text',
      blocks: {
        [WHITEBOARD]: {
          id: WHITEBOARD,
          type: 'whiteboardEmbed',
          parentId: DOC,
          index: 'a0',
          attrs: { height: 480, region },
        },
        [SUB_PAGE]: { id: SUB_PAGE, type: 'page', parentId: DOC, index: 'a1' },
        e1: {
          id: 'e1',
          type: 'embed',
          parentId: DOC,
          index: 'a2',
          attrs: embedAttrs,
        },
      },
    });

    const back = Object.values(markdownToBlocks(DOC, markdown)).sort((a, b) =>
      a.index < b.index ? -1 : 1
    );
    expect(back.map((b) => b.type)).toEqual([
      'whiteboardEmbed',
      'page',
      'embed',
    ]);
    expect(back[0]).toMatchObject({ id: WHITEBOARD });
    expect(back[0]!.attrs).toEqual({ height: 480, region });
    expect(back[1]).toMatchObject({ id: SUB_PAGE });
    expect(back[1]!.attrs).toBeUndefined();
    expect(back[2]!.attrs).toEqual(embedAttrs);
  });

  it('keeps a malformed embed as an ordinary code block', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '```colanode-database\n{not json\n```')
    );
    expect(blocks.map((b) => b.type)).toEqual(['codeBlock']);
    expect(blocks[0]!.attrs).toMatchObject({ language: 'colanode-database' });
  });

  it('refuses an embed without a valid id, or the same node twice', () => {
    expect(() =>
      markdownToBlocks(DOC, '```colanode-page\n{"id":"not-an-id"}\n```')
    ).toThrow(/needs the id/);

    const fence =
      '```colanode-page\n' + JSON.stringify({ id: SUB_PAGE }) + '\n```';
    expect(() => markdownToBlocks(DOC, `${fence}\n\n${fence}`)).toThrow(
      /embedded twice/
    );
  });

  it('refuses a web embed that is not a web address', () => {
    expect(() =>
      markdownToBlocks(
        DOC,
        '```colanode-embed\n{"url":"javascript:alert(1)","provider":"x"}\n```'
      )
    ).toThrow(/invalid "url"/);
  });
});

describe('images', () => {
  it('turns ![x](file:<id>) into a file block whose id IS the file id', () => {
    const id = '01kz6nz23jsk9mv3ws0h6k28vnfi';
    const blocks = markdownToBlocks(DOC, `![power chain](file:${id})`);
    const block = blocks[id];
    expect(block).toBeDefined();
    expect(block!.type).toBe('file');
    expect(block!.parentId).toBe(DOC);
  });

  it('round-trips a file block', () => {
    const id = '01kz6nz23jsk9mv3ws0h6k28vnfi';
    const md = richTextToMarkdown(DOC, {
      type: 'rich_text',
      blocks: markdownToBlocks(DOC, `![x](file:${id})`),
    });
    expect(md.trim()).toBe(`![](file:${id})`);
  });

  it('no longer leaves a stray ! for an image it cannot display', () => {
    const blocks = Object.values(
      markdownToBlocks(DOC, '![schema](https://example.com/y.png)')
    );
    const leaves = blocks[0]!.content ?? [];
    expect(leaves.map((l) => l.text)).toEqual(['schema']);
    expect(leaves[0]!.marks?.[0]?.type).toBe('link');
  });

  it('stops treating a file block as unrepresentable', () => {
    const id = '01kz6nz23jsk9mv3ws0h6k28vnfi';
    expect(
      unrepresentableBlockTypes({
        type: 'rich_text',
        blocks: markdownToBlocks(DOC, `![x](file:${id})`),
      })
    ).toEqual([]);
  });
});

describe('internal links become mentions', () => {
  const WS = '01ky60b09cad2nyfk7c75e6555wc';
  const PAGE = '01ky60x9fb8x1856afmmf01sw1pg';

  const leavesOf = (markdown: string) =>
    Object.values(markdownToBlocks(DOC, markdown))[0]?.content ?? [];

  it('turns node:<id> into a mention, not a link', () => {
    const leaves = leavesOf(`see [Hardware Catalog](node:${PAGE})`);
    const mention = leaves.find((leaf) => leaf.type === 'mention');
    expect(mention).toBeDefined();
    expect(mention!.attrs).toMatchObject({ target: PAGE });
    expect(mention!.attrs!.id).toMatch(/me$/);
    expect(leaves.some((leaf) => leaf.marks?.[0]?.type === 'link')).toBe(false);
  });

  it('accepts the link the Copy link action puts on the clipboard, unlabelled', () => {
    const url = `https://docs.arribada.org/${WS}/${PAGE}`;
    for (const markdown of [`[](${url})`, `[${url}](${url})`]) {
      const leaves = leavesOf(markdown);
      expect(leaves.map((leaf) => leaf.type), markdown).toEqual(['mention']);
      expect(leaves[0]?.attrs, markdown).toMatchObject({ target: PAGE });
    }
  });

  it('accepts the bare workspace path, and a block anchor on the end', () => {
    expect(leavesOf(`[](/${WS}/${PAGE})`)[0]?.attrs).toMatchObject({
      target: PAGE,
    });
    const anchored = leavesOf(
      `[](https://docs.arribada.org/${WS}/${PAGE}#01kzjt1mn5keseg529m93mcvbqbl)`
    );
    expect(anchored[0]?.attrs).toMatchObject({ target: PAGE });
  });

  it('keeps a labelled wiki URL a link, label and address intact', () => {
    // 47 production pages carry links like this one. Turning it into a
    // mention replaced "Saltwater Switch (SWS)" with the page's own title.
    const url = `https://docs.arribada.org/${WS}/${PAGE}`;
    for (const href of [url, `/${WS}/${PAGE}`]) {
      const leaves = leavesOf(`see [Saltwater Switch (SWS)](${href}) here`);
      expect(leaves.some((leaf) => leaf.type === 'mention'), href).toBe(false);
      const link = leaves.find((leaf) => leaf.marks?.[0]?.type === 'link');
      expect(link?.text, href).toBe('Saltwater Switch (SWS)');
      expect(link?.marks?.[0]?.attrs, href).toMatchObject({ href });
    }
  });

  it('leaves an ordinary external link exactly as it was', () => {
    // The guard is that ids are long lowercase alphanumerics. A normal URL
    // path has neither the length nor the shape, so it must not match.
    const leaves = leavesOf('[Arribada](https://arribada.org/about/team)');
    expect(leaves[0]?.type).toBe('text');
    expect(leaves[0]?.marks?.[0]?.type).toBe('link');
    expect(leaves.some((leaf) => leaf.type === 'mention')).toBe(false);
  });

  it('stops deleting the mentions on every page it rewrites', () => {
    // This is the one that mattered. A mention has no text, so it used to fall
    // through the empty-text guard and serialise to nothing -- an edit_page in
    // replace mode silently dropped every internal link the page had.
    const content = {
      type: 'rich_text' as const,
      blocks: {
        b1: {
          id: 'b1',
          type: 'paragraph',
          parentId: DOC,
          index: 'a0',
          content: [
            { type: 'text', text: 'Detail lives in ' },
            { type: 'mention', attrs: { id: 'm1me', target: PAGE } },
            { type: 'text', text: '.' },
          ],
        },
      },
    };

    const markdown = richTextToMarkdown(DOC, content, {
      labels: new Map([[PAGE, 'Hardware Catalog']]),
    });
    expect(markdown).toContain(`[Hardware Catalog](node:${PAGE})`);

    // ...and it survives the trip back, which is what makes replace safe.
    const back =
      Object.values(markdownToBlocks(DOC, markdown))[0]?.content ?? [];
    expect(back.find((leaf) => leaf.type === 'mention')?.attrs).toMatchObject({
      target: PAGE,
    });
  });

  const mentionParagraph = (target: string) => ({
    type: 'rich_text' as const,
    blocks: {
      b1: {
        id: 'b1',
        type: 'paragraph',
        parentId: DOC,
        index: 'a0',
        content: [
          { type: 'text', text: 'see ' },
          { type: 'mention', attrs: { id: 'm1me', target } },
          { type: 'text', text: '.' },
        ],
      },
    },
  });

  const leavesBack = (markdown: string) =>
    Object.values(markdownToBlocks(DOC, markdown))[0]?.content ?? [];

  it('writes an empty label when the target has no known name', () => {
    expect(richTextToMarkdown(DOC, mentionParagraph(PAGE))).toBe(
      `see [](node:${PAGE}).`
    );
  });

  it('escapes brackets and backslashes in a label and still reads the link back', () => {
    const markdown = richTextToMarkdown(DOC, mentionParagraph(PAGE), {
      labels: new Map([[PAGE, 'Specs ] v2 \\ draft']]),
    });
    expect(markdown).toBe(`see [Specs \\] v2 \\\\ draft](node:${PAGE}).`);

    const leaves = leavesBack(markdown);
    expect(leaves.map((leaf) => leaf.type)).toEqual([
      'text',
      'mention',
      'text',
    ]);
    expect(leaves[1]!.attrs).toMatchObject({ target: PAGE });
    expect(leaves[2]!.text).toBe('.');
  });

  it('ignores whatever label the model writes', () => {
    const leaves = leavesBack(`see [a name the model made up](node:${PAGE}).`);
    expect(leaves.map((leaf) => leaf.type)).toEqual([
      'text',
      'mention',
      'text',
    ]);
    expect(leaves.some((leaf) => leaf.text?.includes('made up'))).toBe(false);
  });

  it('round-trips a user mention with its @name label', () => {
    const USER = '01ky6s2zq9b8nqpj15wqxtaepdus';
    const markdown = richTextToMarkdown(DOC, mentionParagraph(USER), {
      labels: new Map([[USER, '@Geoffrey']]),
    });
    expect(markdown).toBe(`see [@Geoffrey](node:${USER}).`);
    expect(leavesBack(markdown)[1]!.attrs).toMatchObject({ target: USER });
  });

  it('collects each mention target once', () => {
    const content = mentionParagraph(PAGE);
    content.blocks.b1.content.push({
      type: 'mention',
      attrs: { id: 'm2me', target: PAGE },
    });
    expect(collectMentionTargets(content)).toEqual([PAGE]);
  });
});
