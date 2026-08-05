// ABOUTME: Context for spreadsheet-style drag-fill in a table view — drag a
// ABOUTME: cell's bottom-right handle across rows AND columns to copy its value
// ABOUTME: into every same-type cell of the rectangle.
import { createContext, useContext } from 'react';

import { LocalRecordNode } from '@colanode/client/types';

export interface TableFillState {
  sourceRow: number;
  sourceCol: number;
  currentRow: number;
  currentCol: number;
}

export interface TableFillContextValue {
  fill: TableFillState | null;
  setRecords: (records: LocalRecordNode[]) => void;
  start: (row: number, col: number) => void;
  enter: (row: number, col: number) => void;
  isInFillRange: (row: number, col: number) => boolean;
}

export const TableFillContext = createContext<TableFillContextValue | null>(
  null
);

export const useTableFill = () => useContext(TableFillContext);
