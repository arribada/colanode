import { useCallback, useMemo } from 'react';

import {
  DatabaseViewFilterAttributes,
  DatabaseViewSortAttributes,
} from '@colanode/core';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

export interface ViewPersonalState {
  enabled: boolean;
  filters?: Record<string, DatabaseViewFilterAttributes>;
  sorts?: Record<string, DatabaseViewSortAttributes>;
}

const EMPTY: ViewPersonalState = { enabled: false };

// Personal (per-user, per-device) filter/sort override for one database view.
// Backed by the local, un-synced `metadata` table so it never touches the
// shared node — exactly how thread-panel width / activeViewId are stored. The
// shared filters/sorts live on the database_view node and are seen by everyone.
export const useViewScope = (viewId: string) => {
  const workspace = useWorkspace();
  const [raw, setRaw] = useMetadata<ViewPersonalState>(
    workspace.userId,
    `view.${viewId}.personal`
  );

  const state = raw ?? EMPTY;
  const mode: 'shared' | 'personal' = state.enabled ? 'personal' : 'shared';

  // setRaw overwrites the whole blob — always merge against the latest `state`.
  const setMode = useCallback(
    (next: 'shared' | 'personal') => {
      setRaw({ ...state, enabled: next === 'personal' });
    },
    [setRaw, state]
  );

  const setFilter = useCallback(
    (filterId: string, filter: DatabaseViewFilterAttributes | null) => {
      const filters = { ...(state.filters ?? {}) };
      if (filter === null) {
        delete filters[filterId];
      } else {
        filters[filterId] = { ...filter, id: filterId };
      }
      setRaw({ ...state, enabled: true, filters });
    },
    [setRaw, state]
  );

  const setSort = useCallback(
    (sortId: string, sort: DatabaseViewSortAttributes | null) => {
      const sorts = { ...(state.sorts ?? {}) };
      if (sort === null) {
        delete sorts[sortId];
      } else {
        sorts[sortId] = { ...sort, id: sortId };
      }
      setRaw({ ...state, enabled: true, sorts });
    },
    [setRaw, state]
  );

  const clearPersonal = useCallback(() => setRaw({ enabled: false }), [setRaw]);

  return useMemo(
    () => ({ mode, state, setMode, setFilter, setSort, clearPersonal }),
    [mode, state, setMode, setFilter, setSort, clearPersonal]
  );
};
