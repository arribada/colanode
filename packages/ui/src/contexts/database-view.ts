import { createContext, useContext } from 'react';

import { ViewField } from '@colanode/client/types';
import {
  DatabaseViewFilterAttributes,
  DatabaseViewSortAttributes,
  DatabaseViewLayout,
  DatabaseViewChartAttributes,
  DatabaseViewTimelineAttributes,
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
  timeline: DatabaseViewTimelineAttributes | null | undefined;
  conditionalColors: DatabaseViewConditionalColorAttributes[];
  nameWidth: number;
  zebra: boolean;
  // Per-column summary footer choices, keyed by field id (or the special 'name'
  // id). Values are SummaryKind strings. Empty when no column has a summary.
  summaries: Record<string, string>;
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
