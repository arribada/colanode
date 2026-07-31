import { useCallback, useEffect, useMemo, useRef } from 'react';

import { PresenceKind, PresencePayload, PresenceState } from '@colanode/core';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { presenceColor } from '@colanode/ui/lib/presence';

// Minimum gap between two presence broadcasts for the same node. The publisher
// coalesces to the latest state via requestAnimationFrame and never emits more
// often than this.
const MIN_PUBLISH_INTERVAL = 60;
// Re-broadcast the last presence on this cadence so idle viewers (caret parked,
// no movement) stay visible under the receiver's TTL.
const HEARTBEAT_INTERVAL = 15_000;

/**
 * Remote presences for a node, excluding the local user (all of their devices).
 * Backed by the presence.list live query so it re-renders as people move.
 */
export const usePresences = (nodeId: string): PresenceState[] => {
  const workspace = useWorkspace();
  const { data } = useLiveQuery({
    type: 'presence.list',
    userId: workspace.userId,
    nodeId,
  });

  return useMemo(
    () => (data ?? []).filter((p) => p.userId !== workspace.userId),
    [data, workspace.userId]
  );
};

interface PresencePublisherOptions {
  nodeId: string;
  rootId: string;
  kind: PresenceKind;
}

/**
 * Publish the local user's ephemeral presence for a node. Returns a throttled
 * `publish` and a `leave`; a leave is emitted automatically on unmount.
 */
export const usePresencePublisher = ({
  nodeId,
  rootId,
  kind,
}: PresencePublisherOptions) => {
  const workspace = useWorkspace();
  const userId = workspace.userId;
  const workspaceId = workspace.workspaceId;
  const color = useMemo(() => presenceColor(userId), [userId]);

  const { data: users } = useQuery({ type: 'user.list', userId });
  const me = users?.find((u) => u.id === userId);
  const name = me?.customName ?? me?.name ?? '';
  const avatar = me?.customAvatar ?? me?.avatar ?? null;

  const identityRef = useRef({ name, avatar, color });
  identityRef.current = { name, avatar, color };

  const latestPayloadRef = useRef<PresencePayload | null>(null);
  const dirtyRef = useRef(false);
  const lastSentRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const hasPublishedRef = useRef(false);

  const send = useCallback(
    (payload: PresencePayload) => {
      lastSentRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      hasPublishedRef.current = true;
      window.colanode.executeMutation({
        type: 'presence.update',
        userId,
        nodeId,
        rootId,
        workspaceId,
        kind,
        name: identityRef.current.name,
        color: identityRef.current.color,
        avatar: identityRef.current.avatar,
        payload,
      });
    },
    [userId, nodeId, rootId, workspaceId, kind]
  );

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastSentRef.current < MIN_PUBLISH_INTERVAL) {
        // Too soon; keep spinning until the interval elapses.
        scheduleFlush();
        return;
      }
      if (dirtyRef.current && latestPayloadRef.current) {
        dirtyRef.current = false;
        send(latestPayloadRef.current);
      }
    });
  }, [send]);

  const publish = useCallback(
    (payload: PresencePayload) => {
      latestPayloadRef.current = payload;
      dirtyRef.current = true;
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const leave = useCallback(() => {
    if (!hasPublishedRef.current) {
      return;
    }
    window.colanode.executeMutation({
      type: 'presence.leave',
      userId,
      nodeId,
      rootId,
      workspaceId,
      kind,
    });
  }, [userId, nodeId, rootId, workspaceId, kind]);

  // Heartbeat so parked cursors don't expire out of the receiver's TTL.
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasPublishedRef.current && latestPayloadRef.current) {
        send(latestPayloadRef.current);
      }
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, [send]);

  // Announce a leave (and cancel pending work) when this node view unmounts.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      leave();
    };
  }, [leave]);

  return { publish, leave };
};
