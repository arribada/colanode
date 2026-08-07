// ABOUTME: Headless round-trip tests for the table row/column reorder builders —
// ABOUTME: proves attrs/content are preserved and merged tables refuse the move.
import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { tableNodes } from '@tiptap/pm/tables';
import { describe, expect, it } from 'vitest';

import {
  buildColumnMove,
  buildRowMove,
  tableHasMergedCells,
} from './table-reorder';

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

const p = (text: string) => schema.nodes.paragraph!.create(null, schema.text(text));
const cell = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.table_cell!.create(attrs, p(text));
const header = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.table_header!.create(attrs, p(text));
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

const grid = () =>
  table(
    row(cell('a', { colwidth: [120] }), cell('b'), cell('c')),
    row(cell('d'), cell('e', { align: 'center' }), cell('f')),
    row(cell('g'), cell('h'), cell('i', { colwidth: [200] }))
  );

describe('table reorder builders', () => {
  it('moves a row and restores it on the inverse move (round-trip)', () => {
    const original = doc(grid());
    let state = stateOf(original);
    const tp = tablePosOf(state.doc);

    const first = buildRowMove(state, tp, 0, 3); // row 0 -> bottom (index 2)
    expect(first.result).toBe('moved');
    state = state.apply(first.tr!);

    // Row 0's first cell (a / colwidth 120) is now the last row's first cell.
    const movedTable = state.doc.nodeAt(tp)!;
    expect(movedTable.child(2).child(0).textContent).toBe('a');
    expect(movedTable.child(2).child(0).attrs.colwidth).toEqual([120]);

    const back = buildRowMove(state, tp, 2, 0); // move it back to the top
    expect(back.result).toBe('moved');
    state = state.apply(back.tr!);

    expect(state.doc.eq(original)).toBe(true);
  });

  it('moves a column and restores it on the inverse move (round-trip)', () => {
    const original = doc(grid());
    let state = stateOf(original);
    const tp = tablePosOf(state.doc);

    const first = buildColumnMove(state, tp, 0, 3); // col 0 -> last (index 2)
    expect(first.result).toBe('moved');
    state = state.apply(first.tr!);

    // Column 0 (a/d/g, with a's colwidth) is now the last column.
    const movedTable = state.doc.nodeAt(tp)!;
    expect(movedTable.child(0).child(2).textContent).toBe('a');
    expect(movedTable.child(0).child(2).attrs.colwidth).toEqual([120]);
    expect(movedTable.child(1).child(2).textContent).toBe('d');

    const back = buildColumnMove(state, tp, 2, 0);
    expect(back.result).toBe('moved');
    state = state.apply(back.tr!);

    expect(state.doc.eq(original)).toBe(true);
  });

  it('keeps header cells in the header row when moving a column', () => {
    const original = doc(
      table(
        row(header('H1'), header('H2'), header('H3')),
        row(cell('a'), cell('b'), cell('c'))
      )
    );
    let state = stateOf(original);
    const tp = tablePosOf(state.doc);

    const move = buildColumnMove(state, tp, 0, 3); // first column to the end
    expect(move.result).toBe('moved');
    state = state.apply(move.tr!);

    const movedTable = state.doc.nodeAt(tp)!;
    const headerRow = movedTable.child(0);
    for (let i = 0; i < headerRow.childCount; i++) {
      expect(headerRow.child(i).type.spec.tableRole).toBe('header_cell');
    }
    expect(headerRow.child(2).textContent).toBe('H1');

    const back = buildColumnMove(state, tp, 2, 0);
    state = state.apply(back.tr!);
    expect(state.doc.eq(original)).toBe(true);
  });

  it('refuses moves on tables with merged cells', () => {
    const mergedDoc = doc(
      table(
        row(cell('a', { colspan: 2 }), cell('c')),
        row(cell('d'), cell('e'), cell('f'))
      )
    );
    const state = stateOf(mergedDoc);
    const tp = tablePosOf(state.doc);

    expect(tableHasMergedCells(state.doc.nodeAt(tp)!)).toBe(true);
    expect(buildRowMove(state, tp, 0, 2).result).toBe('merged');
    expect(buildColumnMove(state, tp, 0, 3).result).toBe('merged');
    expect(buildRowMove(state, tp, 0, 2).tr).toBeNull();
  });

  it('is a no-op when the drop target equals the current position', () => {
    const state = stateOf(doc(grid()));
    const tp = tablePosOf(state.doc);

    expect(buildRowMove(state, tp, 1, 1).result).toBe('noop'); // before self
    expect(buildRowMove(state, tp, 1, 2).result).toBe('noop'); // after self
    expect(buildColumnMove(state, tp, 1, 1).result).toBe('noop');
    expect(buildColumnMove(state, tp, 1, 2).result).toBe('noop');
  });

  it('handles single-row and single-column tables without corruption', () => {
    const singleRow = stateOf(doc(table(row(cell('a'), cell('b'), cell('c')))));
    const srtp = tablePosOf(singleRow.doc);
    expect(buildRowMove(singleRow, srtp, 0, 1).result).toBe('noop');

    const singleCol = stateOf(doc(table(row(cell('a')), row(cell('b')))));
    const sctp = tablePosOf(singleCol.doc);
    expect(buildColumnMove(singleCol, sctp, 0, 1).result).toBe('noop');
    // Row move within a single-column table still works.
    const move = buildRowMove(singleCol, sctp, 0, 2);
    expect(move.result).toBe('moved');
  });
});
