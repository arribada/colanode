// ABOUTME: Live column aggregates (sum/avg/count/min/max) for editor tables — a
// ABOUTME: pure computeAggregate/formatAggregate plus a reader that pulls a cell's
// ABOUTME: column values from the ProseMirror doc so a summary cell recomputes.
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';

import { parseNumberLoose } from '@colanode/ui/editor/views/table-sort';

export type AggregateKind = 'sum' | 'avg' | 'count' | 'min' | 'max';
export const AGGREGATE_KINDS: AggregateKind[] = [
  'sum',
  'avg',
  'count',
  'min',
  'max',
];

// Pure aggregate over a column's raw cell texts. `count` is non-empty cells
// (COUNTA); the numeric aggregates ignore non-numeric cells. Returns null when
// there is nothing to compute (empty column) so the caller can show a dash.
export const computeAggregate = (
  cellTexts: string[],
  kind: AggregateKind
): number | null => {
  if (kind === 'count') {
    return cellTexts.filter((text) => text.trim() !== '').length;
  }
  const numbers = cellTexts
    .map(parseNumberLoose)
    .filter((value): value is number => value !== null);
  if (numbers.length === 0) {
    return kind === 'sum' ? 0 : null;
  }
  switch (kind) {
    case 'sum':
      return numbers.reduce((total, value) => total + value, 0);
    case 'avg':
      return numbers.reduce((total, value) => total + value, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
  }
};

// Human-facing rendering of an aggregate: counts are integers; the rest use the
// viewer's locale grouping with up to two decimals; null shows an em dash.
export const formatAggregate = (
  value: number | null,
  kind: AggregateKind
): string => {
  if (value === null) {
    return '—';
  }
  if (kind === 'count') {
    return String(value);
  }
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const tableRole = (node: PMNode): string | undefined =>
  node.type.spec.tableRole as string | undefined;

interface CellLocation {
  table: PMNode;
  tableStart: number;
  row: number;
  col: number;
}

// Resolve the enclosing table and the (row, col) of the cell at `cellPos`.
const locateCell = (
  state: EditorState,
  cellPos: number
): CellLocation | null => {
  const $pos = state.doc.resolve(cellPos + 1);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (tableRole($pos.node(depth)) === 'table') {
      const table = $pos.node(depth);
      const tableStart = $pos.start(depth);
      const rect = TableMap.get(table).findCell(cellPos - tableStart);
      return { table, tableStart, row: rect.top, col: rect.left };
    }
  }
  return null;
};

// The aggregate of the cells sitting ABOVE the given cell in its column, skipping
// header cells and other summary cells. Used by the summary cell node view, which
// recomputes it on every editor transaction so totals stay live.
export const computeColumnAggregate = (
  state: EditorState,
  cellPos: number,
  kind: AggregateKind
): number | null => {
  const location = locateCell(state, cellPos);
  if (!location) {
    return null;
  }
  const { table, tableStart, row, col } = location;
  const map = TableMap.get(table);
  const texts: string[] = [];
  for (let r = 0; r < row; r++) {
    const offset = map.map[r * map.width + col];
    if (offset === undefined) {
      continue;
    }
    const cell = state.doc.nodeAt(tableStart + offset);
    if (!cell || tableRole(cell) === 'header_cell') {
      continue;
    }
    const cellAggregate = cell.attrs.aggregate as string | null;
    if (cellAggregate && cellAggregate !== 'none') {
      continue;
    }
    texts.push(cell.textContent);
  }
  return computeAggregate(texts, kind);
};
