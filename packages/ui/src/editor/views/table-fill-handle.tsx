// ABOUTME: The spreadsheet fill handle — a corner grip on the active cell that,
// ABOUTME: dragged down or right, fills the covered cells with computeFillSeries.
import { type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { TableMap } from '@tiptap/pm/tables';

import { computeFillSeries } from '@colanode/ui/editor/views/table-fill';

interface CellCoords {
  row: number;
  col: number;
}

const isTableRole = (node: PMNode, role: string): boolean =>
  node.type.spec.tableRole === role;

// The table node + its start position that encloses a given cell position.
const findEnclosingTable = (
  editor: Editor,
  cellPos: number
): { table: PMNode; tableStart: number } | null => {
  const $pos = editor.state.doc.resolve(cellPos + 1);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isTableRole(node, 'table')) {
      return { table: node, tableStart: $pos.start(depth) };
    }
  }
  return null;
};

const coordsOfCell = (
  table: PMNode,
  tableStart: number,
  cellPos: number
): CellCoords | null => {
  const map = TableMap.get(table);
  const offset = cellPos - tableStart;
  const slot = map.map.indexOf(offset);
  if (slot === -1) {
    return null;
  }
  return { row: Math.floor(slot / map.width), col: slot % map.width };
};

const cellPosOf = (
  table: PMNode,
  tableStart: number,
  row: number,
  col: number
): number => {
  const map = TableMap.get(table);
  return tableStart + (map.map[row * map.width + col] ?? 0);
};

// The cell coordinates under the given viewport point, or null when the point is
// not over a cell of this table (e.g. dragged below the table).
const coordsAtPoint = (
  editor: Editor,
  table: PMNode,
  tableStart: number,
  x: number,
  y: number
): CellCoords | null => {
  const found = editor.view.posAtCoords({ left: x, top: y });
  if (!found) {
    return null;
  }
  const $pos = editor.state.doc.resolve(found.pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isTableRole(node, 'cell') || isTableRole(node, 'header_cell')) {
      return coordsOfCell(table, tableStart, $pos.before(depth));
    }
  }
  return null;
};

const textOfCell = (editor: Editor, cellPos: number): string => {
  const node = editor.state.doc.nodeAt(cellPos);
  return node ? node.textContent : '';
};

// Fill from the source cell towards the cell under (x, y), down a column or along
// a row (whichever axis the drag favours). Returns false when there is nothing to
// fill. One transaction; each target cell's content is replaced by a paragraph
// carrying the computed series value, so cell attrs (width/align/colors) survive.
export const applyFillFromDrag = (
  editor: Editor,
  sourceCellPos: number,
  x: number,
  y: number
): boolean => {
  const enclosing = findEnclosingTable(editor, sourceCellPos);
  if (!enclosing) {
    return false;
  }
  const { table, tableStart } = enclosing;
  const source = coordsOfCell(table, tableStart, sourceCellPos);
  const pointer = coordsAtPoint(editor, table, tableStart, x, y);
  if (!source || !pointer) {
    return false;
  }

  const dRow = pointer.row - source.row;
  const dCol = pointer.col - source.col;
  const targets: CellCoords[] = [];
  if (Math.abs(dRow) >= Math.abs(dCol) && dRow > 0) {
    for (let row = source.row + 1; row <= pointer.row; row++) {
      targets.push({ row, col: source.col });
    }
  } else if (dCol > 0) {
    for (let col = source.col + 1; col <= pointer.col; col++) {
      targets.push({ row: source.row, col });
    }
  }
  if (targets.length === 0) {
    return false;
  }

  const paragraphType = editor.schema.nodes.paragraph;
  if (!paragraphType) {
    return false;
  }

  const sourceText = textOfCell(
    editor,
    cellPosOf(table, tableStart, source.row, source.col)
  );
  const values = computeFillSeries([sourceText], targets.length);

  const tr = editor.state.tr;
  // Apply from the bottom/right-most cell upwards so each replacement sits above
  // (after) the next one and never shifts the positions still to be written.
  const writes = targets
    .map((cell, index) => ({
      pos: cellPosOf(table, tableStart, cell.row, cell.col),
      text: values[index] ?? '',
    }))
    .sort((a, b) => b.pos - a.pos);

  for (const write of writes) {
    const cellNode = editor.state.doc.nodeAt(write.pos);
    if (!cellNode) {
      continue;
    }
    const from = write.pos + 1;
    const to = write.pos + 1 + cellNode.content.size;
    const paragraph = paragraphType.create(
      null,
      write.text ? editor.schema.text(write.text) : undefined
    );
    tr.replaceWith(from, to, paragraph);
  }

  if (tr.docChanged) {
    editor.view.dispatch(tr);
    return true;
  }
  return false;
};
