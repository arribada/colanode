import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FieldValue } from '@colanode/core';
import { parseNumberLoose } from '@colanode/ui/editor/views/table-sort';
import { LocalRecordNode } from '@colanode/client/types';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { TableSelectionBar } from '@colanode/ui/components/databases/tables/table-selection-bar';
import { TableViewBody } from '@colanode/ui/components/databases/tables/table-view-body';
import { TableViewHeader } from '@colanode/ui/components/databases/tables/table-view-header';
import { TableViewRecordCreateRow } from '@colanode/ui/components/databases/tables/table-view-record-create-row';
import { TableViewSummaryRow } from '@colanode/ui/components/databases/tables/table-view-summary-row';
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

// Parse a TSV clipboard payload into a grid of raw strings. Rows split on
// newlines (tolerating CRLF), columns on tabs; a trailing newline is ignored.
const parseTsv = (text: string): string[][] =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'));

// Coerce one pasted cell string to the target field's value shape. Returns
// undefined to clear an empty cell, or 'skip' for field types we don't paste
// into (dates, selects, relations, ...) so we never corrupt structured values.
const coerceCell = (
  raw: string,
  type: string
): FieldValue | undefined | 'skip' => {
  const trimmed = raw.trim();
  switch (type) {
    case 'number': {
      if (trimmed === '') {
        return undefined;
      }
      const parsed = parseNumberLoose(trimmed);
      return parsed !== null
        ? { type: 'number', value: parsed }
        : 'skip';
    }
    case 'text':
      return trimmed === '' ? undefined : { type: 'text', value: raw };
    case 'email':
    case 'phone':
    case 'url':
      return trimmed === '' ? undefined : { type: 'string', value: raw };
    default:
      return 'skip';
  }
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
  const clipboardRef = useRef<{
    values: (FieldValue | undefined)[][];
    types: string[];
    tsv: string;
  } | null>(null);

  // Start a range at a cell and drive it entirely from window pointer events,
  // resolving the hovered cell via elementFromPoint + its data-cell-* markers.
  // This is robust regardless of per-cell pointer-enter quirks.
  const beginAt = useCallback((row: number, col: number) => {
    setAnchor({ row, col });
    setFocus({ row, col });

    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell =
        el instanceof Element
          ? (el.closest('[data-cell-row]') as HTMLElement | null)
          : null;
      if (!cell) {
        return;
      }
      const r = Number(cell.getAttribute('data-cell-row'));
      const c = Number(cell.getAttribute('data-cell-col'));
      if (Number.isFinite(r) && Number.isFinite(c)) {
        setFocus({ row: r, col: c });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
    const tsv = tsvRows.join('\n');
    clipboardRef.current = { values, types, tsv };
    try {
      void navigator.clipboard?.writeText(tsv);
    } catch {
      // clipboard may be unavailable; internal buffer still works
    }
  }, [anchor, focus]);

  const pasteRange = useCallback(async () => {
    if (!anchor) {
      return;
    }
    const records = recordsRef.current;
    const cols = columnsRef.current;
    const startRow = Math.min(anchor.row, focus?.row ?? anchor.row);
    const startCol = Math.min(anchor.col, focus?.col ?? anchor.col);
    const buf = clipboardRef.current;

    // Prefer the system clipboard when it holds an EXTERNAL grid (a paste from a
    // spreadsheet / another app). We recognise our own copy by comparing to the
    // buffer's TSV, in which case we keep the richer internal values below.
    let external: string[][] | null = null;
    try {
      const text = await navigator.clipboard?.readText();
      if (text && (text.includes('\t') || text.includes('\n'))) {
        if (!buf || text.replace(/\r\n?/g, '\n') !== buf.tsv) {
          external = parseTsv(text);
        }
      }
    } catch {
      // Clipboard may reject (permissions/focus); fall back to the buffer.
    }

    if (external) {
      for (let i = 0; i < external.length; i++) {
        const row = external[i];
        if (!row) {
          continue;
        }
        for (let j = 0; j < row.length; j++) {
          const target = records[startRow + i];
          const targetField = cols[startCol + j]?.field;
          if (!target || !targetField) {
            continue;
          }
          const coerced = coerceCell(row[j] ?? '', targetField.type);
          if (coerced === 'skip') {
            continue;
          }
          workspace.collections.nodes.update(target.id, (draft) => {
            if (draft.type !== 'record') {
              return;
            }
            if (coerced === undefined) {
              delete draft.fields[targetField.id];
            } else {
              draft.fields[targetField.id] = coerced;
            }
          });
        }
      }
      return;
    }

    if (!buf) {
      return;
    }
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
        void pasteRange();
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
      extendTo: () => {},
      isSelected: isCellSelected,
      clear: clearRange,
    }),
    [anchor, focus, beginAt, isCellSelected, clearRange]
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
              <TableViewSummaryRow />
            </div>
            <TableSelectionBar />
          </Fragment>
        </TableCellRangeContext.Provider>
      </TableFillContext.Provider>
    </TableSelectionContext.Provider>
  );
};
