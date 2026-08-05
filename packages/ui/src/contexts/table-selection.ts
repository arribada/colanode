// ABOUTME: Context for multi-row selection in a database table view — shared by
// ABOUTME: the header (select-all), the rows (per-row checkbox) and the action bar.
import { createContext, useContext } from 'react';

export interface TableSelectionContextValue {
  selectedIds: Set<string>;
  loadedIds: string[];
  allSelected: boolean;
  setLoadedIds: (ids: string[]) => void;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

export const TableSelectionContext =
  createContext<TableSelectionContextValue | null>(null);

export const useTableSelection = () => useContext(TableSelectionContext);
