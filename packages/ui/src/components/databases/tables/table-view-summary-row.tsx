// ABOUTME: The summary/aggregation footer for the table view — one cell per
// ABOUTME: column with a live-recomputed value, aligned to the record rows.
import { useEffect } from 'react';

import { SpecialId } from '@colanode/core';
import { SummaryKind } from '@colanode/ui/components/databases/tables/table-view-summary';
import { TableViewSummaryCell } from '@colanode/ui/components/databases/tables/table-view-summary-cell';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';

export const TableViewSummaryRow = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const canEdit = database.canEdit && !database.isLocked;
  const summaries = view.summaries ?? {};
  const hasAnySummary = Object.keys(summaries).length > 0;

  // Aggregations should reflect the whole result set, not just the rows the
  // body has lazily loaded, so this pulls every page (the same live query +
  // eager pagination the chart view uses). Only bother once a summary exists.
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(view.filters, view.sorts, 200);

  useEffect(() => {
    if (hasAnySummary && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasAnySummary, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const setSummary = (fieldId: string, kind: SummaryKind) => {
    if (!canEdit) {
      return;
    }
    workspace.collections.nodes.update(view.id, (draft) => {
      if (draft.type !== 'database_view') {
        return;
      }
      const next = { ...(draft.summaries ?? {}) };
      if (kind === 'none') {
        delete next[fieldId];
      } else {
        next[fieldId] = kind;
      }
      draft.summaries = next;
    });
  };

  // Nothing to show for a read-only viewer who has no summaries configured.
  if (!hasAnySummary && !canEdit) {
    return null;
  }

  const records = data;
  const nameKind = (summaries[SpecialId.Name] as SummaryKind) ?? 'none';

  return (
    <div className="group/summary animate-fade-in flex flex-row items-center gap-0.5 border-t bg-muted/20">
      <span
        className="flex items-center justify-center"
        style={{ width: '30px', minWidth: '30px' }}
      />
      <div
        className="h-8 border-r overflow-hidden"
        style={{ width: `${view.nameWidth}px`, minWidth: '300px' }}
      >
        <TableViewSummaryCell
          field={null}
          records={records}
          kind={nameKind}
          canEdit={canEdit}
          onChange={(kind) => setSummary(SpecialId.Name, kind)}
        />
      </div>
      {view.fields.map((viewField) => {
        const kind = (summaries[viewField.field.id] as SummaryKind) ?? 'none';
        return (
          <div
            key={`summary-${viewField.field.id}`}
            className="h-8 border-r p-1 overflow-hidden"
            style={{ width: `${viewField.width}px` }}
          >
            <TableViewSummaryCell
              field={viewField.field}
              records={records}
              kind={kind}
              canEdit={canEdit}
              onChange={(next) => setSummary(viewField.field.id, next)}
            />
          </div>
        );
      })}
      <div className="w-8" />
    </div>
  );
};
