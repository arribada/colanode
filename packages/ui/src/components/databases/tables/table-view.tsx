import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { TableSelectionBar } from '@colanode/ui/components/databases/tables/table-selection-bar';
import { TableViewBody } from '@colanode/ui/components/databases/tables/table-view-body';
import { TableViewHeader } from '@colanode/ui/components/databases/tables/table-view-header';
import { TableViewRecordCreateRow } from '@colanode/ui/components/databases/tables/table-view-record-create-row';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewSettingsPopover } from '@colanode/ui/components/databases/view-settings-popover';
import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import {
  TableFillContext,
  TableFillState,
} from '@colanode/ui/contexts/table-fill';
import { TableSelectionContext } from '@colanode/ui/contexts/table-selection';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const TableView = () => {
  const workspace = useWorkspace();
  // Database context is available but not needed here directly; the view holds
  // the ordered columns used by the fill.
  useDatabase();
  const view = useDatabaseView();

  // --- multi-row selection --------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadedIds, setLoadedIdsState] = useState<string[]>([]);

  const setLoadedIds = useCallback((ids: string[]) => {
    setLoadedIdsState((prev) =>
      prev.length === ids.length && prev.every((v, i) => v === ids[i])
        ? prev
        : ids
    );
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const allSelected = useMemo(
    () => loadedIds.length > 0 && loadedIds.every((id) => selectedIds.has(id)),
    [loadedIds, selectedIds]
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const everySelected =
        loadedIds.length > 0 && loadedIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (everySelected) {
        loadedIds.forEach((id) => next.delete(id));
      } else {
        loadedIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [loadedIds]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const selectionValue = useMemo(
    () => ({
      selectedIds,
      loadedIds,
      allSelected,
      setLoadedIds,
      toggle,
      toggleAll,
      clear,
      isSelected,
    }),
    [
      selectedIds,
      loadedIds,
      allSelected,
      setLoadedIds,
      toggle,
      toggleAll,
      clear,
      isSelected,
    ]
  );

  // --- drag-fill (2D) -------------------------------------------------------
  // Records + ordered columns are kept in refs (never trigger a re-render) so
  // the fill always reads the freshest values and column layout.
  const recordsRef = useRef<LocalRecordNode[]>([]);
  const setRecords = useCallback((records: LocalRecordNode[]) => {
    recordsRef.current = records;
  }, []);
  const columnsRef = useRef(view.fields);
  columnsRef.current = view.fields;

  const [fill, setFill] = useState<TableFillState | null>(null);

  const start = useCallback((row: number, col: number) => {
    setFill({
      sourceRow: row,
      sourceCol: col,
      currentRow: row,
      currentCol: col,
    });
  }, []);

  const enter = useCallback((row: number, col: number) => {
    setFill((prev) =>
      prev ? { ...prev, currentRow: row, currentCol: col } : prev
    );
  }, []);

  const isInFillRange = useCallback(
    (row: number, col: number) => {
      if (!fill) {
        return false;
      }
      const r0 = Math.min(fill.sourceRow, fill.currentRow);
      const r1 = Math.max(fill.sourceRow, fill.currentRow);
      const c0 = Math.min(fill.sourceCol, fill.currentCol);
      const c1 = Math.max(fill.sourceCol, fill.currentCol);
      return row >= r0 && row <= r1 && col >= c0 && col <= c1;
    },
    [fill]
  );

  // On pointer release: copy the source cell value into every cell of the
  // rectangle whose column shares the source column's field type (so a value
  // never lands in an incompatible column).
  const endFill = useCallback(() => {
    setFill((f) => {
      if (
        !f ||
        (f.currentRow === f.sourceRow && f.currentCol === f.sourceCol)
      ) {
        return null;
      }
      const records = recordsRef.current;
      const cols = columnsRef.current;
      const sourceField = cols[f.sourceCol]?.field;
      if (!sourceField) {
        return null;
      }
      const value = records[f.sourceRow]?.fields?.[sourceField.id];
      const r0 = Math.min(f.sourceRow, f.currentRow);
      const r1 = Math.max(f.sourceRow, f.currentRow);
      const c0 = Math.min(f.sourceCol, f.currentCol);
      const c1 = Math.max(f.sourceCol, f.currentCol);
      for (let r = r0; r <= r1 && r < records.length; r++) {
        for (let c = c0; c <= c1 && c < cols.length; c++) {
          if (r === f.sourceRow && c === f.sourceCol) {
            continue;
          }
          const targetField = cols[c]?.field;
          if (!targetField || targetField.type !== sourceField.type) {
            continue;
          }
          const target = records[r];
          if (!target) {
            continue;
          }
          workspace.collections.nodes.update(target.id, (draft) => {
            if (draft.type !== 'record') {
              return;
            }
            if (value === undefined) {
              delete draft.fields[targetField.id];
            } else {
              draft.fields[targetField.id] = JSON.parse(JSON.stringify(value));
            }
          });
        }
      }
      return null;
    });
  }, [workspace]);

  useEffect(() => {
    if (!fill) {
      return;
    }
    window.addEventListener('pointerup', endFill);
    return () => window.removeEventListener('pointerup', endFill);
  }, [fill, endFill]);

  const fillValue = useMemo(
    () => ({ fill, setRecords, start, enter, isInFillRange }),
    [fill, setRecords, start, enter, isInFillRange]
  );

  return (
    <TableSelectionContext.Provider value={selectionValue}>
      <TableFillContext.Provider value={fillValue}>
        <Fragment>
          <div className="sticky top-0 left-0 z-30 flex w-full min-w-0 max-w-full flex-row justify-between border-b bg-background">
            <ViewTabs />
            <div className="sticky right-0 flex shrink-0 flex-row items-center justify-end bg-background pl-2">
              <div className="invisible flex flex-row items-center group-hover/database:visible">
                <ViewFullscreenButton />
                <ViewSettingsPopover />
              </div>
              <ViewSortButton />
              <ViewFilterButton />
            </div>
          </div>
          <ViewSearchBar />
          <div
            className={`mt-2 w-full min-w-full max-w-full overflow-auto pr-5 ${
              fill ? 'select-none' : ''
            }`}
          >
            <TableViewHeader />
            <TableViewBody />
            <TableViewRecordCreateRow />
          </div>
          <TableSelectionBar />
        </Fragment>
      </TableFillContext.Provider>
    </TableSelectionContext.Provider>
  );
};
