// ABOUTME: Reviewed, transparent row/column reorder for editor tables — a single
// ABOUTME: transaction that rebuilds table content with one row/column relocated.
import { type Editor } from '@tiptap/core';
import { type Node as ProseMirrorNode, type ResolvedPos } from '@tiptap/pm/model';
import { type EditorState, type Transaction } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';

// 'moved'  – a transaction was produced and (in the editor wrappers) dispatched.
// 'noop'   – the drop target equals the current position; nothing to do.
// 'merged' – the table contains a spanning cell; the move is refused.
// 'invalid'– bad position / not a table / ragged rows; refused defensively.
export type TableMoveResult = 'moved' | 'noop' | 'merged' | 'invalid';

// Reorder axis, matching the drag handles' own union.
type Axis = 'row' | 'col';

// Resolve nodes by their prosemirror-tables `tableRole` rather than by node name.
// TipTap renames the nodes to camelCase (tableRow/tableCell/tableHeader) but keeps
// the role, and raw prosemirror-tables uses snake_case — the role is stable across
// both, which also lets the pure builders below be unit-tested with a bare schema.
const tableRole = (node: ProseMirrorNode): string | undefined =>
  node.type.spec.tableRole as string | undefined;

const tableNodeAt = (
  doc: ProseMirrorNode,
  tablePos: number
): ProseMirrorNode | null => {
  const node = doc.nodeAt(tablePos);
  return node && tableRole(node) === 'table' ? node : null;
};

// A table is "merged" when any cell spans more than one row or column. Reordering
// a single row/column across such a span would corrupt the grid, so moves are
// refused (plain selection is still allowed). Detected structurally from attrs.
export const tableHasMergedCells = (table: ProseMirrorNode): boolean => {
  let merged = false;
  table.forEach((row) => {
    row.forEach((cell) => {
      const colspan = (cell.attrs.colspan as number | undefined) ?? 1;
      const rowspan = (cell.attrs.rowspan as number | undefined) ?? 1;
      if (colspan > 1 || rowspan > 1) {
        merged = true;
      }
    });
  });
  return merged;
};

// Move the item at index `from` to gap `gap` (0..len). Gap g sits *before* the
// item currently at index g; gap === len means "after the last item". Returns the
// reordered array and the moved item's final index. This is the single source of
// truth for the drop-target arithmetic used by both row and column moves.
const moveByGap = <T>(
  items: readonly T[],
  from: number,
  gap: number
): { next: T[]; index: number } => {
  const next = items.slice();
  const moved = next.splice(from, 1)[0] as T;
  const index = gap > from ? gap - 1 : gap;
  next.splice(index, 0, moved);
  return { next, index };
};

// The document position pointing *at* the cell in grid slot `slot` (i.e. the
// position directly before the cell node, which is what CellSelection expects).
// `map.map[slot]` is the cell offset from the table's content start.
const resolveCell = (
  doc: ProseMirrorNode,
  tableStart: number,
  map: TableMap,
  slot: number
): ResolvedPos => doc.resolve(tableStart + (map.map[slot] ?? 0));

const rowSelectionAt = (
  doc: ProseMirrorNode,
  table: ProseMirrorNode,
  tablePos: number,
  rowIndex: number
): CellSelection => {
  const map = TableMap.get(table);
  const tableStart = tablePos + 1;
  const anchor = resolveCell(doc, tableStart, map, rowIndex * map.width);
  const head = resolveCell(
    doc,
    tableStart,
    map,
    rowIndex * map.width + (map.width - 1)
  );
  return CellSelection.rowSelection(anchor, head);
};

export const colSelectionAt = (
  doc: ProseMirrorNode,
  table: ProseMirrorNode,
  tablePos: number,
  colIndex: number
): CellSelection => {
  const map = TableMap.get(table);
  const tableStart = tablePos + 1;
  const anchor = resolveCell(doc, tableStart, map, colIndex);
  const head = resolveCell(
    doc,
    tableStart,
    map,
    (map.height - 1) * map.width + colIndex
  );
  return CellSelection.colSelection(anchor, head);
};

// ---------------------------------------------------------------------------
// Pure builders (no EditorView / DOM). Return the transaction to dispatch plus a
// result code. These are the reviewable core and are exercised directly by the
// round-trip unit test.
// ---------------------------------------------------------------------------

export const buildRowMove = (
  state: EditorState,
  tablePos: number,
  from: number,
  gap: number
): { tr: Transaction | null; result: TableMoveResult } => {
  const table = tableNodeAt(state.doc, tablePos);
  if (!table) return { tr: null, result: 'invalid' };

  const rowCount = table.childCount;
  if (from < 0 || from >= rowCount || gap < 0 || gap > rowCount) {
    return { tr: null, result: 'invalid' };
  }
  if (tableHasMergedCells(table)) return { tr: null, result: 'merged' };

  const targetIndex = gap > from ? gap - 1 : gap;
  if (targetIndex === from) return { tr: null, result: 'noop' };

  // Rows are whole tableRow nodes, so reordering the children array preserves
  // every cell's attrs (colwidth/align/backgroundColor/borderStyle) and content
  // by construction — no cell is touched.
  const rows: ProseMirrorNode[] = [];
  table.forEach((row) => {
    rows.push(row);
  });
  const { next, index } = moveByGap(rows, from, gap);

  const tableStart = tablePos + 1;
  const tr = state.tr.replaceWith(
    tableStart,
    tableStart + table.content.size,
    next
  );

  const movedTable = tableNodeAt(tr.doc, tablePos);
  if (movedTable) {
    tr.setSelection(rowSelectionAt(tr.doc, movedTable, tablePos, index));
  }
  return { tr, result: 'moved' };
};

export const buildColumnMove = (
  state: EditorState,
  tablePos: number,
  from: number,
  gap: number
): { tr: Transaction | null; result: TableMoveResult } => {
  const table = tableNodeAt(state.doc, tablePos);
  if (!table) return { tr: null, result: 'invalid' };
  if (tableHasMergedCells(table)) return { tr: null, result: 'merged' };

  const map = TableMap.get(table);
  const width = map.width;
  if (from < 0 || from >= width || gap < 0 || gap > width) {
    return { tr: null, result: 'invalid' };
  }

  const targetIndex = gap > from ? gap - 1 : gap;
  if (targetIndex === from) return { tr: null, result: 'noop' };

  // With no merged cells, every row has exactly `width` cells in visual column
  // order, so moving the cell at `from` in each row reorders that column. Each
  // row is rebuilt from its own (reordered) cell nodes, preserving cell attrs +
  // content and keeping header cells with their column (a header row stays a
  // header row; a header cell simply travels with its column).
  const newRows: ProseMirrorNode[] = [];
  let valid = true;
  table.forEach((row) => {
    if (!valid) return;
    if (row.childCount !== width) {
      valid = false;
      return;
    }
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell) => {
      cells.push(cell);
    });
    const { next } = moveByGap(cells, from, gap);
    newRows.push(row.type.create(row.attrs, next, row.marks));
  });
  if (!valid || newRows.length !== table.childCount) {
    return { tr: null, result: 'invalid' };
  }

  const tableStart = tablePos + 1;
  const tr = state.tr.replaceWith(
    tableStart,
    tableStart + table.content.size,
    newRows
  );

  const movedTable = tableNodeAt(tr.doc, tablePos);
  if (movedTable) {
    tr.setSelection(colSelectionAt(tr.doc, movedTable, tablePos, targetIndex));
  }
  return { tr, result: 'moved' };
};

// ---------------------------------------------------------------------------
// Editor-facing wrappers used by the handles UI.
// ---------------------------------------------------------------------------

export const reorderTableRow = (
  editor: Editor,
  tablePos: number,
  from: number,
  gap: number
): TableMoveResult => {
  const { tr, result } = buildRowMove(editor.view.state, tablePos, from, gap);
  if (tr && result === 'moved') {
    editor.view.dispatch(tr.scrollIntoView());
  }
  return result;
};

export const reorderTableColumn = (
  editor: Editor,
  tablePos: number,
  from: number,
  gap: number
): TableMoveResult => {
  const { tr, result } = buildColumnMove(editor.view.state, tablePos, from, gap);
  if (tr && result === 'moved') {
    editor.view.dispatch(tr.scrollIntoView());
  }
  return result;
};

// Select the whole row / column as a CellSelection so the existing `.selectedCell`
// highlight shows and cell menus (background/align/border) apply to the lot. This
// is non-mutating and therefore safe even on tables with merged cells.
export const selectTableRow = (
  editor: Editor,
  tablePos: number,
  rowIndex: number
): void => {
  const table = tableNodeAt(editor.view.state.doc, tablePos);
  if (!table) return;
  const map = TableMap.get(table);
  if (rowIndex < 0 || rowIndex >= map.height) return;
  const { state } = editor.view;
  editor.view.dispatch(
    state.tr.setSelection(rowSelectionAt(state.doc, table, tablePos, rowIndex))
  );
  editor.view.focus();
};

export const selectTableColumn = (
  editor: Editor,
  tablePos: number,
  colIndex: number
): void => {
  const table = tableNodeAt(editor.view.state.doc, tablePos);
  if (!table) return;
  const map = TableMap.get(table);
  if (colIndex < 0 || colIndex >= map.width) return;
  const { state } = editor.view;
  editor.view.dispatch(
    state.tr.setSelection(colSelectionAt(state.doc, table, tablePos, colIndex))
  );
  editor.view.focus();
};

// ---------------------------------------------------------------------------
// Stable-id capture / resolve for the drag handles. The grabbed row/column is
// remembered by its block id at pointer-down and its index re-resolved at drop,
// so a concurrent structural edit (a row/column inserted or removed elsewhere)
// moves the line the user actually grabbed — not whatever now sits at the old
// index. Every table row/cell carries a stable `id` (the editor's global id
// plugin). Reorder is refused on merged tables, so within a table that can move
// a cell's within-row index equals its visual column index.
// ---------------------------------------------------------------------------

// The block id of the row (axis 'row') or of the top cell of the column (axis
// 'col') at `index`, captured at pointer-down. Returns null if it can't be read
// (no table / out of range / missing id) — the caller then falls back to the
// raw index.
export const captureAxisId = (
  state: EditorState,
  tablePos: number,
  axis: Axis,
  index: number
): string | null => {
  const table = tableNodeAt(state.doc, tablePos);
  if (!table || table.childCount === 0) return null;
  if (axis === 'row') {
    if (index < 0 || index >= table.childCount) return null;
    const id = table.child(index).attrs.id;
    return typeof id === 'string' ? id : null;
  }
  const firstRow = table.child(0);
  if (index < 0 || index >= firstRow.childCount) return null;
  const id = firstRow.child(index).attrs.id;
  return typeof id === 'string' ? id : null;
};

// Re-resolve the CURRENT index of a previously-captured row/column by its block
// id, re-reading the table at `tablePos`. Returns -1 if that row/cell no longer
// exists (the caller then aborts the move rather than moving the wrong line).
export const resolveAxisIndex = (
  state: EditorState,
  tablePos: number,
  axis: Axis,
  id: string
): number => {
  const table = tableNodeAt(state.doc, tablePos);
  if (!table) return -1;
  let found = -1;
  if (axis === 'row') {
    let rowIndex = 0;
    table.forEach((row) => {
      if (found === -1 && row.attrs.id === id) found = rowIndex;
      rowIndex += 1;
    });
    return found;
  }
  table.forEach((row) => {
    if (found !== -1) return;
    let cellIndex = 0;
    row.forEach((cell) => {
      if (found === -1 && cell.attrs.id === id) found = cellIndex;
      cellIndex += 1;
    });
  });
  return found;
};
