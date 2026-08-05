import { createContext, useContext } from 'react';

import { LocalDatabaseViewNode } from '@colanode/client/types';
import { DatabaseViewFilterAttributes } from '@colanode/core';

interface DatabaseViewsContext {
  views: LocalDatabaseViewNode[];
  activeViewId: string;
  onActiveViewChange: (viewId: string) => void;
  inline: boolean;
  // Extra filters injected by an inline embed (applied on top of the
  // active view's own filters). Undefined for full-page databases.
  extraFilters?: DatabaseViewFilterAttributes[];
}

export const DatabaseViewsContext = createContext<DatabaseViewsContext>(
  {} as DatabaseViewsContext
);

export const useDatabaseViews = () => useContext(DatabaseViewsContext);
