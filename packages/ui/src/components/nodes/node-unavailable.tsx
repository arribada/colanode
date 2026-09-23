import { CloudDownload } from 'lucide-react';
import { useEffect, useState } from 'react';

import { NodeContainerSkeleton } from '@colanode/ui/components/nodes/node-container-skeleton';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

// How long the page is given to arrive on its own before the message shows.
const GRACE_MS = 8000;

// A page that has not arrived is asked for directly, then re-asked a few
// times: the fetch can land before the space that carries the collaborator
// grant, and the retry costs one request.
const RETRY_MS = 20000;
const MAX_ATTEMPTS = 4;

// Shown while a node (or one of its ancestors) is not yet available in the
// local database -- typically because the initial sync of a large workspace has
// not delivered it (or the collaborator grant on its space) yet. It shows the
// loading skeleton for a short grace period, then a gentle "still syncing"
// message, so the user is never stuck on a blank screen or an infinite spinner.
// The parent live query re-renders this away as soon as the data arrives.
//
// With a node id it does more than wait: it asks the server for that one page
// ahead of the stream. A cold client receives every space in revision order,
// so a recently written page can be minutes behind -- which is what a phone
// hits on every visit, since mobile browsers drop the local database between
// visits.
export const NodeUnavailable = ({ nodeId }: { nodeId?: string }) => {
  const workspace = useWorkspace();
  const mutation = useMutation();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!nodeId) {
      return;
    }

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchNode = () => {
      attempts++;
      mutation.mutate({
        input: {
          type: 'node.fetch',
          userId: workspace.userId,
          nodeId,
        },
      });

      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(fetchNode, RETRY_MS);
      }
    };

    fetchNode();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
    // Deliberately not keyed on the mutation object: it is rebuilt on every
    // render, and keying the effect on it would restart the loop endlessly.
  }, [nodeId, workspace.userId]);

  if (!waited) {
    return <NodeContainerSkeleton />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <CloudDownload className="mb-4 size-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">Syncing…</h1>
      <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
        This page is still downloading to your device. It will appear
        automatically as soon as your workspace finishes syncing. If nothing
        appears, check your connection and reload the page.
      </p>
    </div>
  );
};
