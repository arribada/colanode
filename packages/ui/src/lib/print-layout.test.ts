import { describe, expect, it } from 'vitest';

import {
  buildDocumentLink,
  buildRevisionRows,
  fitsOnOnePage,
  keepHeadingWithBlock,
  DEFAULT_FIRST_VERSION,
  planImagePrint,
  planTablePrint,
  PRINT_AREA,
  columnPercentages,
  ruleStyleFromClasses,
  tableFitScale,
} from './print-layout';

describe('planImagePrint', () => {
  it('prints a small image at its own size, never enlarged', () => {
    expect(planImagePrint({ naturalWidth: 240, naturalHeight: 120 })).toEqual({
      placement: 'inline',
      width: 240,
      height: 120,
    });
  });

  it('shrinks a moderately large image to the column and keeps it in the flow', () => {
    const plan = planImagePrint({ naturalWidth: 1000, naturalHeight: 600 });
    expect(plan.placement).toBe('inline');
    expect(plan.width).toBe(PRINT_AREA.portrait.width);
    expect(plan.height).toBe(
      Math.round(600 * (PRINT_AREA.portrait.width / 1000))
    );
  });

  it('gives a wide screenshot its own landscape page rather than shrinking it unreadable', () => {
    const plan = planImagePrint({ naturalWidth: 1920, naturalHeight: 1080 });
    expect(plan.placement).toBe('landscape-page');
    expect(plan.width).toBeLessThanOrEqual(PRINT_AREA.landscape.width);
    expect(plan.height).toBeLessThanOrEqual(PRINT_AREA.landscape.height);
    // It must actually print larger than it would have in the column.
    expect(plan.width).toBeGreaterThan(PRINT_AREA.portrait.width);
  });

  it('gives a very tall image its own portrait page', () => {
    const plan = planImagePrint({ naturalWidth: 800, naturalHeight: 3000 });
    expect(plan.placement).toBe('portrait-page');
    expect(plan.height).toBeLessThanOrEqual(PRINT_AREA.portrait.height);
  });

  it('keeps an image the author made small in the editor small on paper', () => {
    const plan = planImagePrint({
      naturalWidth: 1200,
      naturalHeight: 800,
      chosenWidth: 300,
    });
    expect(plan.placement).toBe('inline');
    expect(plan.width).toBeLessThan(300);
    expect(plan.height / plan.width).toBeCloseTo(800 / 1200, 2);
  });

  it('leaves an image of unknown size to the stylesheet', () => {
    expect(planImagePrint({ naturalWidth: 0, naturalHeight: 0 }).width).toBe(0);
  });
});

describe('planImagePrint fitted to the page', () => {
  const fitted = (
    naturalWidth: number,
    naturalHeight: number,
    chosenWidth?: number
  ) =>
    planImagePrint({ naturalWidth, naturalHeight, chosenWidth, fit: 'page' });

  it('never turns the page: a wide screenshot fills the column instead', () => {
    const plan = fitted(1920, 1080);
    expect(plan.placement).toBe('inline');
    expect(plan.width).toBe(PRINT_AREA.portrait.width);
    expect(plan.height).toBe(
      Math.round(1080 * (PRINT_AREA.portrait.width / 1920))
    );
  });

  it('holds a tall image back by the height, not the width', () => {
    const plan = fitted(900, 3000);
    expect(plan.placement).toBe('inline');
    expect(plan.height).toBeLessThanOrEqual(PRINT_AREA.portrait.height);
    expect(plan.width).toBeLessThan(PRINT_AREA.portrait.width);
    // The proportions are kept.
    expect(plan.height / plan.width).toBeCloseTo(3000 / 900, 2);
  });

  it('does not enlarge a small image past its own pixels', () => {
    expect(fitted(240, 120)).toEqual({
      placement: 'inline',
      width: 240,
      height: 120,
    });
  });

  it('ignores the width chosen in the editor, which is the point of the mode', () => {
    expect(fitted(1600, 900, 300).width).toBe(PRINT_AREA.portrait.width);
  });
});

describe('columnPercentages', () => {
  it('turns the editor widths into shares of the table', () => {
    expect(columnPercentages([100, 200, 100])).toEqual([25, 50, 25]);
  });

  it('keeps proportions, not sizes', () => {
    expect(columnPercentages([50, 100])).toEqual(columnPercentages([200, 400]));
  });

  it('gives up on widths it cannot use, so the browser shares evenly', () => {
    expect(columnPercentages([])).toEqual([]);
    expect(columnPercentages([100, Number.NaN])).toEqual([]);
    expect(columnPercentages([100, 0])).toEqual([]);
  });
});

describe('tableFitScale', () => {
  it('leaves a table that fits alone', () => {
    expect(
      tableFitScale({
        minWidth: PRINT_AREA.portrait.width,
        placement: 'portrait',
      })
    ).toBe(1);
    expect(
      tableFitScale({
        minWidth: PRINT_AREA.landscape.width - 10,
        placement: 'landscape',
      })
    ).toBe(1);
  });

  it('scales a table down to the page it was given', () => {
    const minWidth = Math.round(PRINT_AREA.landscape.width * 1.25);
    const scale = tableFitScale({ minWidth, placement: 'landscape-compact' });
    expect(scale).toBeLessThan(1);
    expect(minWidth * scale).toBeLessThanOrEqual(
      PRINT_AREA.landscape.width + 1
    );
  });

  it('stops scaling where the text would stop being readable', () => {
    const scale = tableFitScale({
      minWidth: PRINT_AREA.portrait.width * 10,
      placement: 'portrait',
    });
    expect(scale).toBe(0.6);
  });
});

describe('planTablePrint', () => {
  const portrait = PRINT_AREA.portrait.width;
  const landscape = PRINT_AREA.landscape.width;

  it('keeps a table that fits the column as it is', () => {
    expect(
      planTablePrint({ minWidth: portrait - 1, compactMinWidth: 300 })
    ).toBe('portrait');
  });

  it('tries the compact size before giving a table a landscape page', () => {
    expect(
      planTablePrint({
        minWidth: portrait + 50,
        compactMinWidth: portrait - 10,
      })
    ).toBe('portrait-compact');
  });

  it('moves a table to landscape only when even compact cannot fit', () => {
    expect(
      planTablePrint({
        minWidth: landscape - 10,
        compactMinWidth: portrait + 20,
      })
    ).toBe('landscape');
    expect(
      planTablePrint({
        minWidth: landscape + 200,
        compactMinWidth: landscape + 50,
      })
    ).toBe('landscape-compact');
  });
});

describe('fitsOnOnePage', () => {
  it('keeps a block that fits inside the page, with room above it', () => {
    expect(fitsOnOnePage(PRINT_AREA.portrait.height * 0.5, 'portrait')).toBe(
      true
    );
  });

  it('refuses a block as tall as the page, which has to break somewhere', () => {
    expect(fitsOnOnePage(PRINT_AREA.portrait.height, 'portrait')).toBe(false);
  });

  it('measures a landscape block against the landscape page', () => {
    const height = PRINT_AREA.landscape.height * 0.8;
    expect(fitsOnOnePage(height, 'landscape')).toBe(true);
    expect(fitsOnOnePage(height, 'portrait')).toBe(true);
    const tall = PRINT_AREA.portrait.height * 0.8;
    expect(fitsOnOnePage(tall, 'landscape')).toBe(false);
  });

  it('refuses a height it cannot measure', () => {
    expect(fitsOnOnePage(0, 'portrait')).toBe(false);
    expect(fitsOnOnePage(-10, 'portrait')).toBe(false);
  });
});

describe('keepHeadingWithBlock', () => {
  const portrait = PRINT_AREA.portrait.height;

  it('keeps a heading with a picture that leaves room for it', () => {
    expect(
      keepHeadingWithBlock({
        headingHeight: 40,
        blockHeight: portrait * 0.5,
        placement: 'portrait',
        startsOwnPage: false,
      })
    ).toBe('wrap');
  });

  it('gives up when the heading and the block cannot share a page', () => {
    expect(
      keepHeadingWithBlock({
        headingHeight: 40,
        blockHeight: portrait * 0.95,
        placement: 'portrait',
        startsOwnPage: false,
      })
    ).toBe('leave');
  });

  it('counts the heading itself: what fits alone can stop fitting with it', () => {
    const blockHeight = portrait * 0.9 - 10;
    expect(
      keepHeadingWithBlock({
        headingHeight: 4,
        blockHeight,
        placement: 'portrait',
        startsOwnPage: false,
      })
    ).toBe('wrap');
    expect(
      keepHeadingWithBlock({
        headingHeight: 60,
        blockHeight,
        placement: 'portrait',
        startsOwnPage: false,
      })
    ).toBe('leave');
  });

  it('moves the heading onto a page the block already starts, however tall', () => {
    expect(
      keepHeadingWithBlock({
        headingHeight: 40,
        blockHeight: portrait * 3,
        placement: 'landscape',
        startsOwnPage: true,
      })
    ).toBe('into');
  });

  it('measures a landscape block against the landscape page', () => {
    expect(
      keepHeadingWithBlock({
        headingHeight: 30,
        blockHeight: PRINT_AREA.landscape.height * 0.8,
        placement: 'landscape',
        startsOwnPage: false,
      })
    ).toBe('wrap');
    expect(
      keepHeadingWithBlock({
        headingHeight: 30,
        blockHeight: PRINT_AREA.landscape.height * 0.95,
        placement: 'landscape',
        startsOwnPage: false,
      })
    ).toBe('leave');
  });
});

describe('buildRevisionRows', () => {
  const names: Record<string, string> = {
    u1: 'Geoffrey Fournier',
    u2: 'Alasdair Davies',
  };
  const common = {
    createdAt: '2026-03-01T09:00:00.000Z',
    createdBy: 'u1',
    authorName: (id: string) => names[id] ?? 'Unknown',
    formatDate: (iso: string) => iso.slice(0, 10),
  };

  it('gives an unversioned page a single v0.1 row signed by its creator', () => {
    expect(
      buildRevisionRows({ ...common, versionLog: [], currentVersion: null })
    ).toEqual([
      {
        version: DEFAULT_FIRST_VERSION,
        date: '2026-03-01',
        author: 'Geoffrey Fournier',
        changes: 'Initial version',
      },
    ]);
  });

  it('uses the page tag when it has one but no log yet', () => {
    const rows = buildRevisionRows({
      ...common,
      versionLog: null,
      currentVersion: 'v1.0.0',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe('v1.0.0');
  });

  it('lists every cut version newest first, with its author and note', () => {
    const rows = buildRevisionRows({
      ...common,
      currentVersion: 'v1.1.0',
      versionLog: [
        {
          version: 'v1.0.0',
          at: '2026-04-02T10:00:00.000Z',
          by: 'u1',
          note: 'First release',
        },
        {
          version: 'v1.1.0',
          at: '2026-05-10T10:00:00.000Z',
          by: 'u2',
          note: null,
        },
      ],
    });
    expect(rows.map((r) => r.version)).toEqual(['v1.1.0', 'v1.0.0']);
    expect(rows[0]).toMatchObject({
      author: 'Alasdair Davies',
      changes: '—',
      date: '2026-05-10',
    });
    expect(rows[1]).toMatchObject({
      author: 'Geoffrey Fournier',
      changes: 'First release',
    });
  });

  it('does not reorder the caller-owned log in place', () => {
    const log = [
      { version: 'v1.0.0', at: '2026-04-02T10:00:00.000Z', by: 'u1' },
      { version: 'v1.1.0', at: '2026-05-10T10:00:00.000Z', by: 'u1' },
    ];
    buildRevisionRows({ ...common, currentVersion: null, versionLog: log });
    expect(log[0]?.version).toBe('v1.0.0');
  });
});

describe('buildDocumentLink', () => {
  it('uses the web origin the page was opened from', () => {
    expect(buildDocumentLink('https://docs.arribada.org', 'ws1', 'pg1')).toBe(
      'https://docs.arribada.org/ws1/pg1'
    );
  });

  it('falls back to the wiki from the desktop app, whose location is not a web address', () => {
    expect(buildDocumentLink('file://', 'ws1', 'pg1')).toBe(
      'https://docs.arribada.org/ws1/pg1'
    );
    expect(buildDocumentLink(null, 'ws1', 'pg1')).toBe(
      'https://docs.arribada.org/ws1/pg1'
    );
  });
});

describe('ruleStyleFromClasses', () => {
  it('reads each divider style from the classes the editor draws it with', () => {
    expect(ruleStyleFromClasses('w-full h-0.5 rounded-sm bg-muted')).toBe(
      'line'
    );
    expect(
      ruleStyleFromClasses('w-full h-1 rounded-sm bg-muted-foreground/50')
    ).toBe('thick');
    expect(ruleStyleFromClasses('w-full h-0 border-t-2 border-dashed')).toBe(
      'dashed'
    );
    expect(ruleStyleFromClasses('w-full h-0 border-t-2 border-dotted')).toBe(
      'dotted'
    );
  });

  it('does not take a taller utility for the thick rule', () => {
    expect(ruleStyleFromClasses('w-full h-10 bg-muted')).toBe('line');
  });
});
