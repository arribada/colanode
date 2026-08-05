// ABOUTME: Context for spreadsheet-style drag-fill in a table view — drag a cell's
// ABOUTME: bottom-right handle down to copy its value into the cells below.
import { createContext, useContext } from 'react';

import { LocalRecordNode } from '@colanode/client/types';

export interface TableFillState {
  fieldId: string;
  sourceIndex: number;
  currentIndex: number;
}

export interface TableFillContextValue {
  fill: TableFillState | null;
  setRecords: (records: LocalRecordNode[]) => void;
  start: (fieldId: string, index: number) => void;
  enter: (fieldId: string, index: number) => void;
  isInFillRange: (fieldId: string, index: number) => boolean;
}

export const TableFillContext = createContext<TableFillContextValue | null>(
  null
);

export const useTableFill = () => useContext(TableFillContext);
