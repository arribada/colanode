// ABOUTME: Reactive access to a node's historical viewers ("Viewed by") plus a
// ABOUTME: throttled recorder that logs at most one view per node per few minutes.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { NodeViewEntry } from '@colanode/client/mutations';

export const nodeViewsQueryKey = (nodeId: string) => ['node-views', nodeId];

// One TanStack query of a node's viewers, keyed by nodeId, shared by every
// consumer. node_views lives ONLY on the server (it is not synced into the local
// database), so — exactly like the favorites list — we fetch it over the mutation
// bridge rather than through a local-DB query handler.
export const useNodeViews = (userId: string, nodeId: string) => {
  return useQuery({
    queryKey: nodeViewsQueryKey(nodeId),
    queryFn: async (): Promise<NodeViewEntry[]> => {
      const result = await window.colanode.executeMutation({
        type: 'node.view.list',
        userId,
        nodeId,
      });

      if (result.success) {
        return result.output.views;
      }

      return [];
    },
  });
};

// Returns a callback that refetches a node's viewers. Call it after recording a
// view so every "Viewed by" indicator for that node updates.
export const useInvalidateNodeViews = () => {
  const queryClient = useQueryClient();
  return (nodeId: string) =>
    queryClient.invalidateQueries({ queryKey: nodeViewsQueryKey(nodeId) });
};

// Module-level throttle shared across every mount: the last time (ms) we recorded
// a view for a given "userId:nodeId". Re-renders, tab switches and quick back-and-
// forth navigation all consult this, so the endpoint is hit at most once per node
// per throttle window instead of on every mount/render.
const lastRecordedAt = new Map<string, number>();
const RECORD_THROTTLE_MS = 5 * 60 * 1000;

// Records ONE view when a document mounts (and again only once the throttle window
// has elapsed). Fire-and-forget: it never blocks render, ignores failures, and on
// success refreshes the viewers list so the current user appears in their own
// "Viewed by" (self-views are recorded, matching Notion).
export const useRecordNodeView = (userId: string, nodeId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !nodeId) {
      return;
    }

    const key = `${userId}:${nodeId}`;
    const now = Date.now();
    const previous = lastRecordedAt.get(key);
    if (previous && now - previous < RECORD_THROTTLE_MS) {
      return;
    }
    lastRecordedAt.set(key, now);

    let cancelled = false;
    void window.colanode
      .executeMutation({
        type: 'node.view.record',
        userId,
        nodeId,
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.success) {
          queryClient.invalidateQueries({
            queryKey: nodeViewsQueryKey(nodeId),
          });
        } else {
          // Let a later navigation retry rather than staying silent for the
          // whole throttle window.
          lastRecordedAt.delete(key);
        }
      })
      .catch(() => {
        lastRecordedAt.delete(key);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, nodeId, queryClient]);
};
