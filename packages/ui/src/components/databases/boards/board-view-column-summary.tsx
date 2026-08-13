// ABOUTME: The aggregation strip under a board column header -- the same
// ABOUTME: `summaries` the table renders in its footer, computed per column.

import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes, SpecialId } from '@colanode/core';
import {
  computeSummaryValue,
  SUMMARY_LABELS,
  SummaryKind,
} from '@colanode/ui/components/databases/tables/table-view-summary';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

interface BoardViewColumnSummaryProps {
  records: LocalRecordNode[];
}

const format = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

export const BoardViewColumnSummary = ({
  records,
}: BoardViewColumnSummaryProps) => {
  const database = useDatabase();
  const view = useDatabaseView();

  const entries = Object.entries(view.summaries ?? {});
  if (entries.length === 0) {
    return null;
  }

  const cells = entries
    .map(([fieldId, rawKind]) => {
      const kind = rawKind as SummaryKind;
      if (kind === 'none') {
        return null;
      }

      // The record-name column is addressed by a special id and has no field
      // attributes; anything else must resolve, or the field was deleted after
      // the summary was chosen and there is nothing left to count.
      let field: FieldAttributes | null;
      if (fieldId === SpecialId.Name) {
        field = null;
      } else {
        field = database.fields.find((item) => item.id === fieldId) ?? null;
        if (field === null) {
          return null;
        }
      }

      const value = computeSummaryValue(records, field, kind);
      if (value === null) {
        return null;
      }

      return {
        key: fieldId,
        label: SUMMARY_LABELS[kind],
        name: field?.name ?? 'Name',
        value: format(value),
      };
    })
    .filter((cell): cell is NonNullable<typeof cell> => cell !== null);

  if (cells.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-row flex-wrap gap-x-3 gap-y-0.5 px-1 pt-1">
      {cells.map((cell) => (
        <span
          key={cell.key}
          className="text-[11px] text-muted-foreground"
          title={`${cell.label} of ${cell.name}`}
        >
          {cell.label} <span className="text-foreground">{cell.value}</span>
        </span>
      ))}
    </div>
  );
};
