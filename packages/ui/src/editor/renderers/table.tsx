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
const extractText = (node?: JSONContent): string => {
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

// The static renderer (chat embeds, version history, PDF/print) has no live
// editor, so summary cells + number formats -- which the editable node view
// applies as React overlays -- are computed here from the table JSON instead,
// so exports match what the author sees.
export const TableRenderer = ({ node, keyPrefix }: TableRendererProps) => {
  const rows = node.content ?? [];

  const overrideFor = (
    rowIndex: number,
    colIndex: number,
    cell: JSONContent
  ): string | null => {
    const aggregate = cell.attrs?.aggregate as string | undefined;
    const numberFormat = cell.attrs?.numberFormat as string | undefined;

    if (aggregate && aggregate !== 'none') {
      const texts: string[] = [];
      const seen = new Set<number>();
      for (let r = 0; r < rowIndex; r++) {
        const above = rows[r]?.content?.[colIndex];
        // A rowspan cell appears in several rows at the same column index; the
        // JSON has it only once, so plain index iteration already counts it
        // once. `seen` guards the rare duplicated-reference case defensively.
        if (!above || seen.has(r)) {
          continue;
        }
        seen.add(r);
        if (isHeaderCell(above) || hasAggregate(above)) {
          continue;
        }
        texts.push(extractText(above));
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
                const override = overrideFor(rowIndex, colIndex, cell);
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
