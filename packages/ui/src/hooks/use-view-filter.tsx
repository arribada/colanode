import { debounceStrategy, usePacedMutations } from '@tanstack/react-db';
import { useCallback } from 'react';

import { LocalNode } from '@colanode/client/types';
import { DatabaseViewFilterAttributes } from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useViewScope } from '@colanode/ui/hooks/use-view-scope';
import { healFilterOperator } from '@colanode/ui/lib/databases';
import { applyNodeTransaction } from '@colanode/ui/lib/nodes';

interface Input {
  viewId: string;
  filterId: string;
}

export const useViewFilter = ({ viewId, filterId }: Input) => {
  const workspace = useWorkspace();
  const database = useDatabase();
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
      // Every popover displays `operators.find(...) ?? operators[0]` and
      // none of them wrote that fallback back, so a view saved by an older
      // build kept storing an operator the engine does not know. Whoever
      // touches the filter next now stores what they were shown.
      const healed = healFilterOperator(nextFilter, database.fields ?? []);
      if (scope.mode === 'personal') {
        return scope.setFilter(filterId, healed);
      }
      return mutate(healed);
    },
    [scope, filterId, mutate, database.fields]
  );

  const removeFilter = useCallback(() => {
    if (scope.mode === 'personal') {
      return scope.setFilter(filterId, null);
    }
    return mutate(null);
  }, [scope, filterId, mutate]);

  return { updateFilter, removeFilter };
};
