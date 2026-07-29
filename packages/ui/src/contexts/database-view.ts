import { createContext, useContext } from 'react';

import { ViewField } from '@colanode/client/types';
import {
  DatabaseViewFilterAttributes,
  DatabaseViewSortAttributes,
  DatabaseViewLayout,
  DatabaseViewChartAttributes,
  DatabaseViewConditionalColorAttributes,
  SortDirection,
} from '@colanode/core';

interface DatabaseViewContext {
  id: string;
  name: string;
  avatar: string | null | undefined;
  layout: DatabaseViewLayout;
  fields: ViewField[];
  filters: DatabaseViewFilterAttributes[];
  sorts: DatabaseViewSortAttributes[];
  scopeMode: 'shared' | 'personal';
  setScopeMode: (mode: 'shared' | 'personal') => void;
  clearPersonal: () => void;
  groupBy: string | null | undefined;
  chart: DatabaseViewChartAttributes | null | undefined;
  conditionalColors: DatabaseViewConditionalColorAttributes[];
  nameWidth: number;
  isSearchBarOpened: boolean;
  isSortsOpened: boolean;
  initFieldFilter: (fieldId: string) => void;
  initFieldSort: (fieldId: string, direction: SortDirection) => void;
  isFieldFilterOpened: (fieldId: string) => boolean;
  openSearchBar: () => void;
  closeSearchBar: () => void;
  openSorts: () => void;
  closeSorts: () => void;
  openFieldFilter: (fieldId: string) => void;
  closeFieldFilter: (fieldId: string) => void;
  createRecord: (filters?: DatabaseViewFilterAttributes[]) => void;
}

export const DatabaseViewContext = createContext<DatabaseViewContext>(
  {} as DatabaseViewContext
);

export const useDatabaseView = () => useContext(DatabaseViewContext);
