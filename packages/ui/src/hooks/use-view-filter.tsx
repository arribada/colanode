import { debounceStrategy, usePacedMutations } from '@tanstack/react-db';
import { useCallback } from 'react';

import { LocalNode } from '@colanode/client/types';
import { DatabaseViewFilterAttributes } from '@colanode/core';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useViewScope } from '@colanode/ui/hooks/use-view-scope';
import { applyNodeTransaction } from '@colanode/ui/lib/nodes';

interface Input {
  viewId: string;
  filterId: string;
}

export const useViewFilter = ({ viewId, filterId }: Input) => {
  const workspace = useWorkspace();
  const scope = useViewScope(viewId);

  const mutate = usePacedMutations<
    DatabaseViewFilterAttributes | null,
    LocalNode
  >({
    onMutate: (nextFilter) => {
      workspace.collections.nodes.update(viewId, (draft) => {
        if (draft.type !== 'database_view') return;

        if (nextFilter === null) {
          const { [filterId]: _removed, ...rest } = draft.filters ?? {};
          draft.filters = Object.keys(rest).length > 0 ? rest : undefined;
          return;
        }

        draft.filters = {
          ...(draft.filters ?? {}),
          [filterId]: { ...nextFilter, id: filterId },
        };
      });
    },
    mutationFn: async ({ transaction }) => {
      await applyNodeTransaction(workspace.userId, transaction);
    },
    strategy: debounceStrategy({ wait: 500 }),
  });

  const updateFilter = useCallback(
    (nextFilter: DatabaseViewFilterAttributes) => {
      if (scope.mode === 'personal') {
        return scope.setFilter(filterId, nextFilter);
      }
      return mutate(nextFilter);
    },
    [scope, filterId, mutate]
  );

  const removeFilter = useCallback(() => {
    if (scope.mode === 'personal') {
      return scope.setFilter(filterId, null);
    }
    return mutate(null);
  }, [scope, filterId, mutate]);

  return { updateFilter, removeFilter };
};
