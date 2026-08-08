// ABOUTME: CSV/TSV helpers for the editor table — serialize a table to CSV and
// ABOUTME: parse a pasted TSV/CSV grid, so tables round-trip with spreadsheets.
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';
import { type EditorView } from '@tiptap/pm/view';

const tableRole = (node: PMNode): string | undefined =>
  node.type.spec.tableRole as string | undefined;

// The table node enclosing the current selection, or null.
export const tableFromSelection = (state: EditorState): PMNode | null => {
  const $head = state.selection.$head;
  for (let depth = $head.depth; depth > 0; depth--) {
    if (tableRole($head.node(depth)) === 'table') {
      return $head.node(depth);
    }
  }
  return null;
};

// Quote a field if it contains a delimiter, quote, or newline (RFC 4180).
export const csvEscape = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const tableNodeToCsv = (table: PMNode): string => {
  const rows: string[] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(csvEscape(cell.textContent)));
    rows.push(cells.join(','));
  });
  return rows.join('\r\n');
};

// Parse a pasted clipboard grid. Prefers TSV (what Excel/Sheets put on the
// clipboard); falls back to CSV with RFC-4180 quoting. Returns a rectangular-ish
// array of rows of cell strings, or null when the text isn't a grid.
export const parseClipboardGrid = (text: string): string[][] | null => {
  if (text.includes('\t')) {
    const rows = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    return rows.map((row) => row.split('\t'));
  }

  // CSV with quotes.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let sawDelimiter = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      sawDelimiter = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Require a real delimiter so multi-line prose pasted into a cell isn't
  // mistaken for a one-column grid and spread down the column.
  if (!sawDelimiter) {
    return null;
  }
  return rows;
};

// Paste a parsed grid into the table at the current selection, top-left at the
// anchor cell, clamped to the table's bounds (never grows the table). One
// transaction; merged cells written once; cell attrs preserved.
export const pasteGridAtSelection = (
  view: EditorView,
  grid: string[][]
): boolean => {
  const { state } = view;
  const $head = state.selection.$head;
  let tableDepth = -1;
  for (let depth = $head.depth; depth > 0; depth--) {
    if (tableRole($head.node(depth)) === 'table') {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth === -1) {
    return false;
  }
  const table = $head.node(tableDepth);
  const tableStart = $head.start(tableDepth);

  let cellPos = -1;
  for (let depth = $head.depth; depth > tableDepth; depth--) {
    const role = tableRole($head.node(depth));
    if (role === 'cell' || role === 'header_cell') {
      cellPos = $head.before(depth);
      break;
    }
  }
  if (cellPos === -1) {
    return false;
  }

  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) {
    return false;
  }

  const map = TableMap.get(table);
  const rect = map.findCell(cellPos - tableStart);
  const writes: { pos: number; text: string }[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < grid.length; i++) {
    const row = rect.top + i;
    if (row >= map.height) {
      break;
    }
    const cols = grid[i] ?? [];
    for (let j = 0; j < cols.length; j++) {
      const col = rect.left + j;
      if (col >= map.width) {
        break;
      }
      const offset = map.map[row * map.width + col];
      if (offset === undefined) {
        continue;
      }
      const pos = tableStart + offset;
      if (seen.has(pos)) {
        continue; // a spanning cell resolves to one position -- write once
      }
      seen.add(pos);
      writes.push({ pos, text: cols[j] ?? '' });
    }
  }
  if (writes.length === 0) {
    return false;
  }

  const tr = state.tr;
  writes.sort((a, b) => b.pos - a.pos); // descending keeps earlier positions valid
  for (const write of writes) {
    const cell = state.doc.nodeAt(write.pos);
    if (!cell) {
      continue;
    }
    const from = write.pos + 1;
    const to = write.pos + 1 + cell.content.size;
    const paragraph = paragraphType.create(
      null,
      write.text ? state.schema.text(write.text) : undefined
    );
    tr.replaceWith(from, to, paragraph);
  }
  view.dispatch(tr);
  return true;
};
