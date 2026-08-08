// ABOUTME: Sort a table's body rows by one column — numeric-aware, header rows
// ABOUTME: pinned on top, refused on merged tables. One transaction, rows rebuilt.
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState, type Transaction } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';

import {
  colSelectionAt,
  tableHasMergedCells,
} from '@colanode/ui/editor/views/table-reorder';

export type TableSortResult = 'sorted' | 'noop' | 'merged' | 'invalid';
export type SortDirection = 'asc' | 'desc';

const tableRole = (node: PMNode): string | undefined =>
  node.type.spec.tableRole as string | undefined;

const tableNodeAt = (doc: PMNode, tablePos: number): PMNode | null => {
  const node = doc.nodeAt(tablePos);
  return node && tableRole(node) === 'table' ? node : null;
};

// Parse a value as a number even when wrapped in currency / percent / grouping
// (" $1,234.50 ", "45%", "1 234,56", "1,000"). Returns null when not numeric.
export const parseNumberLoose = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  let cleaned = trimmed.replace(/[\s$%€£]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    // The right-most separator is the decimal one; the other is grouping.
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Comma only: "1,000" / "1,234,567" are grouped thousands; "1,5" is decimal.
    cleaned = /^\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

// Compare two cell values: numbers numerically (and before text), otherwise a
// locale, natural (numeric-aware) string compare. Blanks always sort last.
export const compareCellValues = (a: string, b: string): number => {
  const ta = a.trim();
  const tb = b.trim();
  if (ta === '' && tb === '') return 0;
  if (ta === '') return 1;
  if (tb === '') return -1;
  const na = parseNumberLoose(ta);
  const nb = parseNumberLoose(tb);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return ta.localeCompare(tb, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const isHeaderRow = (row: PMNode): boolean => {
  if (row.childCount === 0) {
    return false;
  }
  let allHeader = true;
  row.forEach((cell) => {
    if (tableRole(cell) !== 'header_cell') {
      allHeader = false;
    }
  });
  return allHeader;
};

const columnText = (row: PMNode, colIndex: number): string => {
  const cell = row.maybeChild(Math.min(colIndex, row.childCount - 1));
  return cell ? cell.textContent : '';
};

// Build the transaction that sorts the table at `tablePos` by column `colIndex`.
export const buildColumnSort = (
  state: EditorState,
  tablePos: number,
  colIndex: number,
  direction: SortDirection
): { tr: Transaction | null; result: TableSortResult } => {
  const table = tableNodeAt(state.doc, tablePos);
  if (!table) {
    return { tr: null, result: 'invalid' };
  }
  if (tableHasMergedCells(table)) {
    return { tr: null, result: 'merged' };
  }
  const width = TableMap.get(table).width;
  if (colIndex < 0 || colIndex >= width) {
    return { tr: null, result: 'invalid' };
  }

  const rows: PMNode[] = [];
  table.forEach((row) => rows.push(row));

  let headerCount = 0;
  while (headerCount < rows.length && isHeaderRow(rows[headerCount]!)) {
    headerCount++;
  }
  const headerRows = rows.slice(0, headerCount);
  const bodyRows = rows.slice(headerCount);
  if (bodyRows.length < 2) {
    return { tr: null, result: 'noop' };
  }

  const decorated = bodyRows.map((row, index) => ({ row, index }));
  decorated.sort((x, y) => {
    const base = compareCellValues(
      columnText(x.row, colIndex),
      columnText(y.row, colIndex)
    );
    const signed = direction === 'asc' ? base : -base;
    return signed !== 0 ? signed : x.index - y.index; // stable
  });

  const sorted = decorated.map((entry) => entry.row);
  if (sorted.every((row, index) => row === bodyRows[index])) {
    return { tr: null, result: 'noop' };
  }

  // Replace only the table's *content* (its rows), reusing the existing row
  // node instances rather than rebuilding the whole table node. This preserves
  // the table node itself (and its stable id), so the Yjs binding re-diffs only
  // the rows: an "already mostly sorted" column keeps its unchanged leading and
  // trailing rows and rewrites just the ones that actually move.
  //
  // Tradeoff: a full reshuffle still rewrites the moved span — y-prosemirror's
  // tree diff can't express row *moves*, so a minimal move-based delta isn't
  // reachable without a different sync model. This keeps the common case cheap
  // without that architecture, and (unlike the previous whole-table replace) no
  // longer recreates the table node's own Yjs element on every sort.
  const tableStart = tablePos + 1;
  const tr = state.tr.replaceWith(
    tableStart,
    tableStart + table.content.size,
    [...headerRows, ...sorted]
  );

  // Restore a CellSelection on the sorted column so the local cursor doesn't
  // jump to the document start after the rows are rewritten (the previous
  // whole-table replace dropped the selection). Mirrors the post-move selection
  // restore in table-reorder.
  const sortedTable = tableNodeAt(tr.doc, tablePos);
  if (sortedTable) {
    tr.setSelection(colSelectionAt(tr.doc, sortedTable, tablePos, colIndex));
  }
  return { tr, result: 'sorted' };
};

// Resolve the table position + column index of the current selection's cell.
export const activeTableColumn = (
  state: EditorState
): { tablePos: number; colIndex: number } | null => {
  const $head = state.selection.$head;
  for (let depth = $head.depth; depth > 0; depth--) {
    if (tableRole($head.node(depth)) === 'table') {
      const table = $head.node(depth);
      const tableStart = $head.start(depth);
      const tablePos = $head.before(depth);
      for (let cellDepth = $head.depth; cellDepth > depth; cellDepth--) {
        const role = tableRole($head.node(cellDepth));
        if (role === 'cell' || role === 'header_cell') {
          const cellPos = $head.before(cellDepth);
          const rect = TableMap.get(table).findCell(cellPos - tableStart);
          return { tablePos, colIndex: rect.left };
        }
      }
      return null;
    }
  }
  return null;
};
