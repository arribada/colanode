import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { CellSelection, tableNodes } from '@tiptap/pm/tables';
import { describe, expect, it } from 'vitest';

import {
  buildColumnSort,
  compareCellValues,
  parseNumberLoose,
} from '@colanode/ui/editor/views/table-sort';

describe('parseNumberLoose', () => {
  it('parses plain and signed numbers', () => {
    expect(parseNumberLoose('42')).toBe(42);
    expect(parseNumberLoose('-3.5')).toBe(-3.5);
  });
  it('strips currency, percent and grouping', () => {
    expect(parseNumberLoose(' $1,234.50 ')).toBe(1234.5);
    expect(parseNumberLoose('45%')).toBe(45);
  });
  it('handles a comma decimal', () => {
    expect(parseNumberLoose('1 234,56')).toBeCloseTo(1234.56);
  });
  it('rejects non-numeric text', () => {
    expect(parseNumberLoose('REQ-1')).toBeNull();
    expect(parseNumberLoose('')).toBeNull();
    expect(parseNumberLoose('12a')).toBeNull();
  });
});

describe('compareCellValues', () => {
  it('orders numbers numerically, not lexically', () => {
    expect(compareCellValues('9', '10')).toBeLessThan(0);
    expect(compareCellValues('100', '20')).toBeGreaterThan(0);
  });
  it('sorts numbers before text', () => {
    expect(compareCellValues('5', 'apple')).toBeLessThan(0);
    expect(compareCellValues('apple', '5')).toBeGreaterThan(0);
  });
  it('sorts text naturally (REQ-2 before REQ-10)', () => {
    expect(compareCellValues('REQ-2', 'REQ-10')).toBeLessThan(0);
  });
  it('always pushes blanks last', () => {
    expect(compareCellValues('', 'x')).toBeGreaterThan(0);
    expect(compareCellValues('x', '')).toBeLessThan(0);
    expect(compareCellValues('', '')).toBe(0);
  });
  it('produces a total order for a mixed column', () => {
    const values = ['10', '', 'banana', '2', 'apple', '$1,000'];
    const asc = [...values].sort(compareCellValues);
    expect(asc).toEqual(['2', '10', '$1,000', 'apple', 'banana', '']);
  });
});

// A bare table schema (matching table-reorder.test.ts) so the transaction-shaped
// parts of buildColumnSort — ordering, header pinning and selection restore — can
// be exercised headlessly without an EditorView / DOM.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
    ...tableNodes({
      tableGroup: 'block',
      cellContent: 'block+',
      cellAttributes: {
        align: { default: null },
        backgroundColor: { default: null },
        borderStyle: { default: null },
      },
    }),
  },
});

const p = (text: string) =>
  schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
const cell = (text: string) => schema.nodes.table_cell!.create(null, p(text));
const header = (text: string) =>
  schema.nodes.table_header!.create(null, p(text));
const row = (...cells: ProseMirrorNode[]) =>
  schema.nodes.table_row!.create(null, cells);
const table = (...rows: ProseMirrorNode[]) =>
  schema.nodes.table!.create(null, rows);
const doc = (tableNode: ProseMirrorNode) =>
  schema.nodes.doc!.create(null, [p('lead'), tableNode]);

const stateOf = (docNode: ProseMirrorNode) =>
  EditorState.create({ schema, doc: docNode });

const tablePosOf = (docNode: ProseMirrorNode): number => {
  let pos = -1;
  docNode.forEach((node, offset) => {
    if (node.type.spec.tableRole === 'table') pos = offset;
  });
  return pos;
};

describe('buildColumnSort', () => {
  it('sorts the body rows, pins the header and restores a column CellSelection', () => {
    const original = doc(
      table(
        row(header('Name'), header('Qty')),
        row(cell('banana'), cell('3')),
        row(cell('apple'), cell('10')),
        row(cell('cherry'), cell('2'))
      )
    );
    let state = stateOf(original);
    const tp = tablePosOf(state.doc);

    const { tr, result } = buildColumnSort(state, tp, 0, 'asc');
    expect(result).toBe('sorted');
    state = state.apply(tr!);

    const sorted = state.doc.nodeAt(tp)!;
    // Header stays pinned on top.
    expect(sorted.child(0).child(0).textContent).toBe('Name');
    expect(sorted.child(0).child(0).type.spec.tableRole).toBe('header_cell');
    // Body rows are now alphabetical by column 0.
    expect(sorted.child(1).child(0).textContent).toBe('apple');
    expect(sorted.child(2).child(0).textContent).toBe('banana');
    expect(sorted.child(3).child(0).textContent).toBe('cherry');

    // Selection restored as a column CellSelection on the sorted column, so the
    // cursor no longer collapses to the document start.
    expect(state.selection).toBeInstanceOf(CellSelection);
    expect((state.selection as CellSelection).isColSelection()).toBe(true);
  });

  it('sorts numeric columns numerically and descending on request', () => {
    const original = doc(
      table(
        row(cell('3'), cell('x')),
        row(cell('10'), cell('y')),
        row(cell('2'), cell('z'))
      )
    );
    let state = stateOf(original);
    const tp = tablePosOf(state.doc);

    const { tr, result } = buildColumnSort(state, tp, 0, 'desc');
    expect(result).toBe('sorted');
    state = state.apply(tr!);

    const sorted = state.doc.nodeAt(tp)!;
    expect(sorted.child(0).child(0).textContent).toBe('10');
    expect(sorted.child(1).child(0).textContent).toBe('3');
    expect(sorted.child(2).child(0).textContent).toBe('2');
    expect(state.selection).toBeInstanceOf(CellSelection);
  });

  it('preserves the other columns row-for-row when sorting', () => {
    const original = doc(
      table(
        row(cell('banana'), cell('yellow')),
        row(cell('apple'), cell('red')),
        row(cell('cherry'), cell('dark'))
      )
    );
    let state = stateOf(original);
    const tp = tablePosOf(state.doc);

    const { tr } = buildColumnSort(state, tp, 0, 'asc');
    state = state.apply(tr!);

    const sorted = state.doc.nodeAt(tp)!;
    // The paired second column travels with its row.
    expect(sorted.child(0).child(1).textContent).toBe('red'); // apple
    expect(sorted.child(1).child(1).textContent).toBe('yellow'); // banana
    expect(sorted.child(2).child(1).textContent).toBe('dark'); // cherry
  });

  it('is a no-op when the column is already sorted', () => {
    const original = doc(
      table(row(cell('a'), cell('1')), row(cell('b'), cell('2')))
    );
    const state = stateOf(original);
    const tp = tablePosOf(state.doc);

    const { tr, result } = buildColumnSort(state, tp, 0, 'asc');
    expect(result).toBe('noop');
    expect(tr).toBeNull();
  });

  it('refuses to sort a table with merged cells', () => {
    const merged = doc(
      table(
        row(cell('b'), cell('x')),
        row(schema.nodes.table_cell!.create({ colspan: 2 }, p('a')))
      )
    );
    const state = stateOf(merged);
    const tp = tablePosOf(state.doc);

    expect(buildColumnSort(state, tp, 0, 'asc').result).toBe('merged');
    expect(buildColumnSort(state, tp, 0, 'asc').tr).toBeNull();
  });
});
