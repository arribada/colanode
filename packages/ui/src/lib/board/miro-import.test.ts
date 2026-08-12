import { describe, expect, it } from 'vitest';

import {
  convertMiroBoard,
  MiroConnector,
  MiroItem,
  miroTextToPlain,
  parseMiroExport,
} from '@colanode/ui/lib/board/miro-import';

const shape = (over: Partial<MiroItem> = {}): MiroItem => ({
  id: 'm1',
  type: 'shape',
  data: { content: '<p>Hello</p>', shape: 'round_rectangle' },
  style: { fillColor: '#e7e7e7', borderColor: '#1a1a1a', borderWidth: '2.0' },
  geometry: { width: 100, height: 40 },
  position: { x: 200, y: 100 },
  ...over,
});

describe('miroTextToPlain', () => {
  it('keeps line breaks that <br> and block ends stand for', () => {
    expect(miroTextToPlain('<p>one<br />two</p><p>three</p>')).toBe(
      'one\ntwo\nthree'
    );
  });

  it('decodes entities and drops the tags', () => {
    expect(miroTextToPlain('<p><u>A</u> &amp; B &nbsp;C</p>')).toBe('A & B  C');
  });

  it('marks list items so a bulleted note stays readable', () => {
    expect(miroTextToPlain('<ul><li>a</li><li>b</li></ul>')).toBe('• a\n• b');
  });

  it('is empty for missing content', () => {
    expect(miroTextToPlain(undefined)).toBe('');
  });
});

describe('convertMiroBoard', () => {
  it('converts a centre position into a top-left one', () => {
    const { scene } = convertMiroBoard([shape()]);
    const el = Object.values(scene)[0]!;
    expect(el.x).toBe(150);
    expect(el.y).toBe(80);
    expect(el.w).toBe(100);
    expect(el.h).toBe(40);
  });

  it('applies the offset on top of that', () => {
    const { scene } = convertMiroBoard([shape()], [], { x: 1000, y: 500 });
    const el = Object.values(scene)[0]!;
    expect(el.x).toBe(1150);
    expect(el.y).toBe(580);
  });

  it('maps the shape catalogue down to the three the board has', () => {
    const items = [
      shape({ id: 'a', data: { shape: 'circle' } }),
      shape({ id: 'b', data: { shape: 'rhombus' } }),
      shape({ id: 'c', data: { shape: 'flow_chart_predefined_process' } }),
    ];
    const types = Object.values(convertMiroBoard(items).scene).map(
      (el) => el.type
    );
    expect(types).toEqual(['ellipse', 'diamond', 'rect']);
  });

  it('names an unknown sticky colour to the default rather than dropping it', () => {
    const { scene } = convertMiroBoard([
      {
        id: 's',
        type: 'sticky_note',
        data: { content: '<p>note</p>' },
        style: { fillColor: 'chartreuse' },
        geometry: { width: 100, height: 100 },
        position: { x: 0, y: 0 },
      },
    ]);
    const el = Object.values(scene)[0]!;
    expect(el.type).toBe('sticky');
    expect(el.style.fill).toBe('#fff7ae');
  });

  it('rewires a connector onto the new element ids', () => {
    const items = [shape({ id: 'a' }), shape({ id: 'b', position: { x: 600, y: 100 } })];
    const connectors: MiroConnector[] = [
      {
        id: 'c1',
        startItem: { id: 'a' },
        endItem: { id: 'b' },
        shape: 'elbowed',
        style: { startStrokeCap: 'none', endStrokeCap: 'stealth' },
      },
    ];
    const { scene } = convertMiroBoard(items, connectors);
    const els = Object.values(scene);
    const conn = els.find((el) => el.type === 'connector')!;
    const ids = els.filter((el) => el.type !== 'connector').map((el) => el.id);
    expect(ids).toContain(conn.connector!.fromId);
    expect(ids).toContain(conn.connector!.toId);
    expect(conn.connector!.routing).toBe('elbow');
    expect(conn.connector!.arrowStart).toBe(false);
    expect(conn.connector!.arrowEnd).toBe(true);
  });

  it('drops a connector whose endpoint was not imported, and says so', () => {
    const { scene, report } = convertMiroBoard(
      [shape({ id: 'a' })],
      [{ id: 'c1', startItem: { id: 'a' }, endItem: { id: 'elsewhere' } }]
    );
    expect(Object.values(scene).some((el) => el.type === 'connector')).toBe(
      false
    );
    expect(report.danglingConnectors).toBe(1);
  });

  it('counts what it could not convert instead of dropping it silently', () => {
    const { report } = convertMiroBoard([
      shape(),
      { id: 'i', type: 'image', geometry: {}, position: {} },
      { id: 't', type: 'table', geometry: {}, position: {} },
      { id: 'i2', type: 'image', geometry: {}, position: {} },
    ]);
    expect(report.skipped).toEqual({ image: 2, table: 1 });
    expect(report.created).toEqual({ rect: 1 });
  });

  it('puts children inside the frame they belonged to', () => {
    const items: MiroItem[] = [
      shape({ id: 'child', parent: { id: 'f' } }),
      {
        id: 'f',
        type: 'frame',
        data: { title: 'Hardware' },
        geometry: { width: 1000, height: 800 },
        position: { x: 500, y: 400 },
      },
    ];
    const { scene } = convertMiroBoard(items);
    const frame = Object.values(scene).find((el) => el.type === 'frame')!;
    const child = Object.values(scene).find((el) => el.type === 'rect')!;
    // frames are emitted first precisely so this link can be made
    expect(child.frameId).toBe(frame.id);
    expect(frame.text).toBe('Hardware');
  });
});

describe('parseMiroExport', () => {
  const item = { id: 'a', type: 'shape', geometry: {}, position: {} };
  const conn = { id: 'c', startItem: { id: 'a' }, endItem: { id: 'b' } };

  it('takes a bare array', () => {
    const out = parseMiroExport(JSON.stringify([item]));
    expect(out.items).toHaveLength(1);
  });

  it('takes { items, connectors }', () => {
    const out = parseMiroExport(
      JSON.stringify({ items: [item], connectors: [conn] })
    );
    expect(out.items).toHaveLength(1);
    expect(out.connectors).toHaveLength(1);
  });

  it('takes one REST response, { data: [...] }', () => {
    const out = parseMiroExport(JSON.stringify({ data: [item] }));
    expect(out.items).toHaveLength(1);
  });

  it('separates connectors mixed into the item list', () => {
    const out = parseMiroExport(JSON.stringify([item, conn]));
    expect(out.items).toHaveLength(1);
    expect(out.connectors).toHaveLength(1);
  });

  it('takes a per-frame dump and remembers the frame names', () => {
    const out = parseMiroExport(
      JSON.stringify({ Hardware: [item], Products: [item, item] })
    );
    expect(out.items).toHaveLength(3);
    expect(out.frames).toEqual(['Hardware', 'Products']);
  });

  it('refuses invalid JSON with a readable message', () => {
    expect(() => parseMiroExport('{oops')).toThrow(/not valid JSON/);
  });

  it('refuses an empty import rather than doing nothing quietly', () => {
    expect(() => parseMiroExport('{"nothing":true}')).toThrow(/No Miro items/);
  });
});

describe('mind-map nodes', () => {
  const node = (
    id: string,
    parent: string,
    content: string,
    isRoot = false
  ): MiroItem => ({
    id,
    type: 'mindmap_node',
    data: { isRoot, nodeView: { data: { content: `<p>${content}</p>` } } },
    geometry: { width: 180, height: 60 },
    position: { x: 500, y: 300 },
    parent: { id: parent },
  });

  it('takes the text from nodeView, where the experimental endpoint puts it', () => {
    const { scene } = convertMiroBoard([node('n1', 'frame1', 'Hardware', true)]);
    const el = Object.values(scene)[0]!;
    expect(el.type).toBe('mindmap');
    expect(el.text).toBe('Hardware');
  });

  it('rebuilds the tree, even when a child comes before its parent', () => {
    const items = [
      node('child', 'root', 'Linkit V4'),
      node('root', 'frame1', 'Hardware', true),
    ];
    const { scene } = convertMiroBoard(items);
    const els = Object.values(scene);
    const root = els.find((e) => e.text === 'Hardware')!;
    const child = els.find((e) => e.text === 'Linkit V4')!;
    expect(child.mindmap?.parentId).toBe(root.id);
    expect(root.mindmap?.parentId).toBeUndefined();
  });

  it('never makes a frame the tree parent', () => {
    // A root's parent is the FRAME it sits in. Pointing the tree at a frame
    // would break every walk over it — layout, hidden ids, edges.
    const items: MiroItem[] = [
      {
        id: 'frame1',
        type: 'frame',
        data: { title: 'Hardware list' },
        geometry: { width: 900, height: 600 },
        position: { x: 450, y: 300 },
      },
      node('root', 'frame1', 'Hardware', true),
    ];
    const { scene } = convertMiroBoard(items);
    const root = Object.values(scene).find((e) => e.type === 'mindmap')!;
    expect(root.mindmap?.parentId).toBeUndefined();
    // it still belongs to the frame, just not as a tree parent
    const frame = Object.values(scene).find((e) => e.type === 'frame')!;
    expect(root.frameId).toBe(frame.id);
  });

  it('counts mind-map nodes as created, not skipped', () => {
    const { report } = convertMiroBoard([node('n1', 'f', 'A', true)]);
    expect(report.created.mindmap).toBe(1);
    expect(report.skipped).toEqual({});
  });
});
