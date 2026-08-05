import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FieldValue } from '@colanode/core';
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
  CellPos,
  TableCellRangeContext,
} from '@colanode/ui/contexts/table-cell-range';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import {
  TableFillContext,
  TableFillState,
} from '@colanode/ui/contexts/table-fill';
import { TableSelectionContext } from '@colanode/ui/contexts/table-selection';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const cellToText = (v: FieldValue | undefined): string => {
  if (v === undefined) {
    return '';
  }
  const val = (v as { value?: unknown }).value;
  if (val === null || val === undefined) {
    return '';
  }
  return typeof val === 'object' ? JSON.stringify(val) : String(val);
};

export const TableView = () => {
  const workspace = useWorkspace();
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

  // Shared refs — records + ordered columns, kept fresh without re-rendering.
  const recordsRef = useRef<LocalRecordNode[]>([]);
  const setRecords = useCallback((records: LocalRecordNode[]) => {
    recordsRef.current = records;
  }, []);
  const columnsRef = useRef(view.fields);
  columnsRef.current = view.fields;

  // --- drag-fill (2D) -------------------------------------------------------
  const [fill, setFill] = useState<TableFillState | null>(null);

  const startFill = useCallback((row: number, col: number) => {
    setFill({
      sourceRow: row,
      sourceCol: col,
      currentRow: row,
      currentCol: col,
    });
  }, []);

  const enterFill = useCallback((row: number, col: number) => {
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
    () => ({
      fill,
      setRecords,
      start: startFill,
      enter: enterFill,
      isInFillRange,
    }),
    [fill, setRecords, startFill, enterFill, isInFillRange]
  );

  // --- cell-range selection (Ctrl + drag) -----------------------------------
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [focus, setFocus] = useState<CellPos | null>(null);
  const selectingRef = useRef(false);
  const clipboardRef = useRef<{
    values: (FieldValue | undefined)[][];
    types: string[];
  } | null>(null);

  const beginAt = useCallback((row: number, col: number) => {
    selectingRef.current = true;
    setAnchor({ row, col });
    setFocus({ row, col });
  }, []);

  const extendTo = useCallback((row: number, col: number) => {
    if (selectingRef.current) {
      setFocus({ row, col });
    }
  }, []);

  const clearRange = useCallback(() => {
    setAnchor(null);
    setFocus(null);
  }, []);

  const isCellSelected = useCallback(
    (row: number, col: number) => {
      if (!anchor || !focus) {
        return false;
      }
      const r0 = Math.min(anchor.row, focus.row);
      const r1 = Math.max(anchor.row, focus.row);
      const c0 = Math.min(anchor.col, focus.col);
      const c1 = Math.max(anchor.col, focus.col);
      return row >= r0 && row <= r1 && col >= c0 && col <= c1;
    },
    [anchor, focus]
  );

  useEffect(() => {
    const up = () => {
      selectingRef.current = false;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const copyRange = useCallback(() => {
    if (!anchor || !focus) {
      return;
    }
    const records = recordsRef.current;
    const cols = columnsRef.current;
    const r0 = Math.min(anchor.row, focus.row);
    const r1 = Math.max(anchor.row, focus.row);
    const c0 = Math.min(anchor.col, focus.col);
    const c1 = Math.max(anchor.col, focus.col);
    const types: string[] = [];
    for (let c = c0; c <= c1; c++) {
      types.push(cols[c]?.field.type ?? '');
    }
    const values: (FieldValue | undefined)[][] = [];
    const tsvRows: string[] = [];
    for (let r = r0; r <= r1; r++) {
      const row: (FieldValue | undefined)[] = [];
      const text: string[] = [];
      for (let c = c0; c <= c1; c++) {
        const field = cols[c]?.field;
        const v = field ? records[r]?.fields?.[field.id] : undefined;
        row.push(v);
        text.push(cellToText(v));
      }
      values.push(row);
      tsvRows.push(text.join('\t'));
    }
    clipboardRef.current = { values, types };
    try {
      void navigator.clipboard?.writeText(tsvRows.join('\n'));
    } catch {
      // clipboard may be unavailable; internal buffer still works
    }
  }, [anchor, focus]);

  const pasteRange = useCallback(() => {
    const buf = clipboardRef.current;
    if (!buf || !anchor) {
      return;
    }
    const records = recordsRef.current;
    const cols = columnsRef.current;
    const startRow = Math.min(anchor.row, focus?.row ?? anchor.row);
    const startCol = Math.min(anchor.col, focus?.col ?? anchor.col);
    for (let i = 0; i < buf.values.length; i++) {
      for (let j = 0; j < buf.types.length; j++) {
        const tr = startRow + i;
        const tc = startCol + j;
        const target = records[tr];
        const targetField = cols[tc]?.field;
        if (!target || !targetField || targetField.type !== buf.types[j]) {
          continue;
        }
        const v = buf.values[i]?.[j];
        workspace.collections.nodes.update(target.id, (draft) => {
          if (draft.type !== 'record') {
            return;
          }
          if (v === undefined) {
            delete draft.fields[targetField.id];
          } else {
            draft.fields[targetField.id] = JSON.parse(JSON.stringify(v));
          }
        });
      }
    }
  }, [anchor, focus, workspace]);

  useEffect(() => {
    if (!anchor || !focus) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const editing =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'c' && !editing) {
        copyRange();
      } else if (mod && e.key.toLowerCase() === 'v' && !editing) {
        e.preventDefault();
        pasteRange();
      } else if (e.key === 'Escape') {
        clearRange();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anchor, focus, copyRange, pasteRange, clearRange]);

  const rangeValue = useMemo(
    () => ({
      anchor,
      focus,
      isActive: !!(anchor && focus),
      beginAt,
      extendTo,
      isSelected: isCellSelected,
      clear: clearRange,
    }),
    [anchor, focus, beginAt, extendTo, isCellSelected, clearRange]
  );

  return (
    <TableSelectionContext.Provider value={selectionValue}>
      <TableFillContext.Provider value={fillValue}>
        <TableCellRangeContext.Provider value={rangeValue}>
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
                fill || anchor ? 'select-none' : ''
              }`}
            >
              <TableViewHeader />
              <TableViewBody />
              <TableViewRecordCreateRow />
            </div>
            <TableSelectionBar />
          </Fragment>
        </TableCellRangeContext.Provider>
      </TableFillContext.Provider>
    </TableSelectionContext.Provider>
  );
};
