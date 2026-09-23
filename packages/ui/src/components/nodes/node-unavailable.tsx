import { CloudDownload, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { NodeContainerSkeleton } from '@colanode/ui/components/nodes/node-container-skeleton';
import { Button } from '@colanode/ui/components/ui/button';
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
// visits. The server also says whether the page is in the trash, which is the
// other reason a page never appears, and which waiting would never fix.
export const NodeUnavailable = ({ nodeId }: { nodeId?: string }) => {
  const workspace = useWorkspace();
  const mutation = useMutation();
  const restore = useMutation();
  const [waited, setWaited] = useState(false);
  const [trashed, setTrashed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!nodeId) {
      return;
    }

    let attempts = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchNode = () => {
      attempts++;
      mutation.mutate({
        input: {
          type: 'node.fetch',
          userId: workspace.userId,
          nodeId,
        },
        onSuccess: (output) => {
          if (stopped) {
            return;
          }

          if (output.trashed) {
            // Nothing will ever bring it back on its own; stop asking.
            setTrashed(true);
            setWaited(true);
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
          }
        },
      });

      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(fetchNode, RETRY_MS);
      }
    };

    fetchNode();

    return () => {
      stopped = true;
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

  if (trashed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Trash2 className="mb-4 size-12 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">In the trash</h1>
        <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
          This page was deleted. Restore it to read it again, or find it with
          everything else in the workspace trash.
        </p>
        {nodeId && (
          <Button
            variant="outline"
            className="mt-4"
            disabled={restore.isPending}
            onClick={() =>
              restore.mutate({
                input: {
                  type: 'node.restore',
                  userId: workspace.userId,
                  nodeId,
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Restore this page
          </Button>
        )}
      </div>
    );
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
