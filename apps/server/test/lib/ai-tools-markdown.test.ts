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
    expect(markdown).toBe(
      [
        'Decisions',
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
