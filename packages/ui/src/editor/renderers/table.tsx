import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { TableCellRenderer } from '@colanode/ui/editor/renderers/table-cell';
import { TableHeaderRenderer } from '@colanode/ui/editor/renderers/table-header';
import {
  computeAggregate,
  formatAggregate,
} from '@colanode/ui/editor/views/table-aggregate';
import { parseNumberLoose } from '@colanode/ui/editor/views/table-sort';
import { formatNumber, isNumericFormat } from '@colanode/ui/lib/number-format';

interface TableRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

// Plain-text content of a JSON node (concatenated text leaves).
const extractText = (node?: JSONContent | null): string => {
  if (!node) {
    return '';
  }
  if (node.type === 'text') {
    return node.text ?? '';
  }
  return (node.content ?? []).map(extractText).join('');
};

const isHeaderCell = (cell: JSONContent): boolean =>
  cell.type === 'tableHeader';

const hasAggregate = (cell: JSONContent): boolean => {
  const a = cell.attrs?.aggregate;
  return typeof a === 'string' && a !== 'none';
};

// Expand rows/cells into a logical grid where grid[row][col] is the cell
// occupying that slot, honouring colspan (one cell fills several columns) and
// rowspan (a cell carries into the rows below). A spanning cell appears at every
// slot it covers, so column aggregation must dedupe by cell identity. This is the
// JSON equivalent of prosemirror's TableMap and is what keeps the static totals
// aligned with the live editor once merged cells exist.
const buildLogicalGrid = (rows: JSONContent[]): (JSONContent | null)[][] => {
  const grid: (JSONContent | null)[][] = [];
  const carry: Record<number, { cell: JSONContent; rowsLeft: number }> = {};

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]?.content ?? [];
    const gridRow: (JSONContent | null)[] = [];
    let col = 0;

    const fillCarried = () => {
      while (carry[col] && carry[col]!.rowsLeft > 0) {
        gridRow[col] = carry[col]!.cell;
        carry[col]!.rowsLeft -= 1;
        col += 1;
      }
    };

    for (const cell of cells) {
      const colspan = Number(cell.attrs?.colspan) || 1;
      const rowspan = Number(cell.attrs?.rowspan) || 1;
      for (let c = 0; c < colspan; c++) {
        fillCarried();
        gridRow[col] = cell;
        if (rowspan > 1) {
          carry[col] = { cell, rowsLeft: rowspan - 1 };
        }
        col += 1;
      }
    }
    fillCarried();
    grid.push(gridRow);
  }
  return grid;
};

// The static renderer (chat embeds, version history, PDF/print) has no live
// editor, so summary cells + number formats -- which the editable node view
// applies as React overlays -- are computed here from the table JSON so exports
// match what the author sees.
export const TableRenderer = ({ node, keyPrefix }: TableRendererProps) => {
  const rows = node.content ?? [];
  const grid = buildLogicalGrid(rows);

  const overrideFor = (
    rowIndex: number,
    cell: JSONContent
  ): string | null => {
    const aggregate = cell.attrs?.aggregate as string | undefined;
    const numberFormat = cell.attrs?.numberFormat as string | undefined;

    if (aggregate && aggregate !== 'none') {
      // The cell's logical column = where it starts in the grid row (a spanning
      // cell may occupy several slots; the first is its column).
      const logicalCol = (grid[rowIndex] ?? []).indexOf(cell);
      const texts: string[] = [];
      if (logicalCol !== -1) {
        const seen = new Set<JSONContent>();
        for (let r = 0; r < rowIndex; r++) {
          const above = grid[r]?.[logicalCol];
          // A rowspan cell appears in several rows at this column -- count once.
          if (!above || seen.has(above)) {
            continue;
          }
          seen.add(above);
          if (isHeaderCell(above) || hasAggregate(above)) {
            continue;
          }
          texts.push(extractText(above));
        }
      }
      const value = computeAggregate(
        texts,
        aggregate as Parameters<typeof computeAggregate>[1]
      );
      if (value !== null && isNumericFormat(numberFormat) && aggregate !== 'count') {
        return formatNumber(value, numberFormat);
      }
      return formatAggregate(
        value,
        aggregate as Parameters<typeof formatAggregate>[1]
      );
    }

    if (isNumericFormat(numberFormat)) {
      const parsed = parseNumberLoose(extractText(cell));
      if (parsed !== null) {
        return formatNumber(parsed, numberFormat);
      }
    }
    return null;
  };

  return (
    <table className={defaultClasses.table}>
      <tbody>
        {rows.map((row, rowIndex) => {
          const cells = row.content ?? [];
          return (
            <tr key={`${keyPrefix}-tr-${rowIndex}`} className={defaultClasses.tableRow}>
              {cells.map((cell, colIndex) => {
                const override = overrideFor(rowIndex, cell);
                const cellKey = `${keyPrefix}-td-${rowIndex}-${colIndex}`;
                return isHeaderCell(cell) ? (
                  <TableHeaderRenderer
                    key={cellKey}
                    node={cell}
                    keyPrefix={cellKey}
                    override={override}
                  />
                ) : (
                  <TableCellRenderer
                    key={cellKey}
                    node={cell}
                    keyPrefix={cellKey}
                    override={override}
                  />
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
