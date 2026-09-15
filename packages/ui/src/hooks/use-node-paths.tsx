import { useCallback, useMemo } from 'react';

import { NodePathSegment } from '@colanode/client/queries';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

const NO_PATH: NodePathSegment[] = [];

/**
 * The ancestor paths of a list of nodes, fetched in one query and kept live
 * through renames and moves. Returns a lookup so rows stay simple.
 */
export const useNodePaths = (nodeIds: string[], enabled = true) => {
  const workspace = useWorkspace();

  // Sorted and de-duplicated, so the same set of rows is the same query.
  const key = [...new Set(nodeIds)].sort().join(',');
  const ids = useMemo(() => (key.length > 0 ? key.split(',') : []), [key]);

  const query = useLiveQuery(
    {
      type: 'node.path.list',
      userId: workspace.userId,
      nodeIds: ids,
    },
    {
      enabled: enabled && ids.length > 0,
    }
  );

  const paths = query.data;
  return useCallback(
    (nodeId: string): NodePathSegment[] => paths?.[nodeId] ?? NO_PATH,
    [paths]
  );
};
