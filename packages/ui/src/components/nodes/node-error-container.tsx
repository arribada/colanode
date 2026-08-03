import { ErrorComponentProps, useParams } from '@tanstack/react-router';
import { BadgeAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { NodeContainerSkeleton } from '@colanode/ui/components/nodes/node-container-skeleton';

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 1200;
const RETRY_WINDOW_MS = 15000;

// A node route almost always errors only transiently — a referenced node
// (mention/embed) or an ancestor in the chain is still syncing — and simply
// re-opening the node clears it. So instead of a dead "Node error" that forces
// the user to click again, show the same loading skeleton the provider uses and
// auto-retry (reset the route boundary) a few times so it self-heals. The retry
// count is tracked per node at module scope so it survives the boundary
// remounting on a repeated throw and a genuinely broken node still surfaces the
// error after a few attempts; a stale entry past the window is ignored, so a
// later, unrelated transient error still gets a fresh set of retries.
const retryLog = new Map<string, { count: number; ts: number }>();

export const NodeErrorContainer = ({ reset }: ErrorComponentProps) => {
  const params = useParams({ strict: false }) as {
    nodeId?: string;
    modalNodeId?: string;
  };
  const key = params.modalNodeId ?? params.nodeId ?? 'node';

  const [attempt, setAttempt] = useState(0);

  const now = Date.now();
  const previous = retryLog.get(key);
  const attempts =
    previous != null && now - previous.ts < RETRY_WINDOW_MS ? previous.count : 0;
  const canRetry = attempts < MAX_AUTO_RETRIES;

  useEffect(() => {
    if (!canRetry) {
      return;
    }
    const timer = setTimeout(() => {
      retryLog.set(key, { count: attempts + 1, ts: Date.now() });
      // Re-render this boundary (recomputes `attempts`) and re-attempt the route
      // so the node renders again once the missing data has synced in.
      setAttempt((a) => a + 1);
      reset();
    }, RETRY_DELAY_MS);
    return () => clearTimeout(timer);
    // `attempts` is intentionally read at schedule time, not tracked as a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, canRetry]);

  if (canRetry) {
    return <NodeContainerSkeleton />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <BadgeAlert className="size-12 mb-4" />
      <h1 className="text-2xl font-semibold tracking-tight">Node error</h1>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        The node you are looking for does not exist. It may have been deleted or
        your access has been removed.
      </p>
    </div>
  );
};
