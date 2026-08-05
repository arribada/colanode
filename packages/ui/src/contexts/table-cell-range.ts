// ABOUTME: Context for spreadsheet-style cell-range selection in a table view —
// ABOUTME: hold Ctrl and drag to select a rectangle of cells, then Ctrl+C /
// ABOUTME: Ctrl+V to copy and paste the block.
import { createContext, useContext } from 'react';

export interface CellPos {
  row: number;
  col: number;
}

export interface TableCellRangeContextValue {
  anchor: CellPos | null;
  focus: CellPos | null;
  isActive: boolean;
  // Ctrl + pointer-down on a cell starts a range there.
  beginAt: (row: number, col: number) => void;
  // Pointer enters a cell while a range drag is in progress.
  extendTo: (row: number, col: number) => void;
  isSelected: (row: number, col: number) => boolean;
  clear: () => void;
}

export const TableCellRangeContext =
  createContext<TableCellRangeContextValue | null>(null);

export const useTableCellRange = () => useContext(TableCellRangeContext);
