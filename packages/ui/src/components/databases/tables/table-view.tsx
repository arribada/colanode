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
import {
  TableFillContext,
  TableFillState,
} from '@colanode/ui/contexts/table-fill';
import { TableSelectionContext } from '@colanode/ui/contexts/table-selection';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const TableView = () => {
  const workspace = useWorkspace();

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

  // --- drag-fill ------------------------------------------------------------
  // Records are kept in a ref (never triggers a re-render) so the fill always
  // reads the freshest values, even after an edit that leaves the ids unchanged.
  const recordsRef = useRef<LocalRecordNode[]>([]);
  const setRecords = useCallback((records: LocalRecordNode[]) => {
    recordsRef.current = records;
  }, []);

  const [fill, setFill] = useState<TableFillState | null>(null);

  const start = useCallback((fieldId: string, index: number) => {
    setFill({ fieldId, sourceIndex: index, currentIndex: index });
  }, []);

  const enter = useCallback((fieldId: string, index: number) => {
    setFill((prev) =>
      prev && prev.fieldId === fieldId
        ? { ...prev, currentIndex: Math.max(index, prev.sourceIndex) }
        : prev
    );
  }, []);

  const isInFillRange = useCallback(
    (fieldId: string, index: number) =>
      fill != null &&
      fill.fieldId === fieldId &&
      index > fill.sourceIndex &&
      index <= fill.currentIndex,
    [fill]
  );

  // End the fill (on pointer release anywhere): copy the source cell value into
  // every target row in the range for that field.
  const endFill = useCallback(() => {
    setFill((f) => {
      if (f && f.currentIndex > f.sourceIndex) {
        const records = recordsRef.current;
        const source = records[f.sourceIndex];
        const value = source?.fields?.[f.fieldId];
        for (
          let i = f.sourceIndex + 1;
          i <= f.currentIndex && i < records.length;
          i++
        ) {
          const target = records[i];
          if (!target) {
            continue;
          }
          workspace.collections.nodes.update(target.id, (draft) => {
            if (draft.type !== 'record') {
              return;
            }
            if (value === undefined) {
              delete draft.fields[f.fieldId];
            } else {
              draft.fields[f.fieldId] = JSON.parse(JSON.stringify(value));
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
