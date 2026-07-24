import { useEffect, useRef, useState } from 'react';

import { Event } from '@colanode/client/types';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

// How long to wait after the last workspace.sync.progress event before
// assuming the workspace has caught up and hiding the indicator.
const IDLE_TIMEOUT_MS = 2500;

export interface WorkspaceSyncActivity {
  isSyncing: boolean;
  itemsSynced: number;
}

// Drives the "Synchronisation..." indicator from Synchronizer's
// workspace.sync.progress events (see packages/client). There is no
// upfront total in the incremental sync protocol -- the server streams
// batches until the client is caught up, with no known end count -- so
// this only exposes a running item count and an activity flag, not a
// percentage. `isSyncing` stays true while events keep arriving and
// flips back to false once none has arrived for IDLE_TIMEOUT_MS.
export const useWorkspaceSyncActivity = (): WorkspaceSyncActivity => {
  const workspace = useWorkspace();
  const [itemsSynced, setItemsSynced] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setItemsSynced(0);
    setIsSyncing(false);

    const handleEvent = (event: Event) => {
      if (
        event.type !== 'workspace.sync.progress' ||
        event.workspace.userId !== workspace.userId
      ) {
        return;
      }

      setItemsSynced((count) => count + event.itemCount);
      setIsSyncing(true);

      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }

      idleTimeoutRef.current = setTimeout(() => {
        setIsSyncing(false);
      }, IDLE_TIMEOUT_MS);
    };

    const subscriptionId = window.eventBus.subscribe(handleEvent);

    return () => {
      window.eventBus.unsubscribe(subscriptionId);
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, [workspace.userId]);

  return { isSyncing, itemsSynced };
};
