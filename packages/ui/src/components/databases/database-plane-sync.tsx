// "Sync now" for a database that mirrors Plane.
//
// Shown by a SIGNAL rather than a hardcoded node id: a database that mirrors
// Plane has a "Plane ID" field, and one that does not, does not. Nothing to
// keep up to date, and the button never appears anywhere it would confuse.

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@colanode/ui/components/ui/button';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

export const DatabasePlaneSync = () => {
  const database = useDatabase();
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();
  // Separate from `isPending`: the request returns as soon as the run is
  // ACCEPTED, but the run takes about a minute. A button that goes idle at
  // once reads as "nothing happened".
  const [running, setRunning] = useState(false);

  const mirrorsPlane = database.fields.some(
    (field) => field.name === 'Plane ID'
  );
  if (!mirrorsPlane) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending || running}
      onClick={() => {
        mutate({
          input: { type: 'plane.sync.run', userId: workspace.userId },
          onSuccess(output) {
            if (output.started) {
              setRunning(true);
              toast.success('Syncing with Plane — about a minute.');
              // Re-enabled afterwards rather than left dead: a second run is
              // a legitimate thing to want.
              setTimeout(() => setRunning(false), 90_000);
            } else {
              toast.info('A sync is already running.');
            }
          },
          onError(error) {
            toast.error(error.message);
          },
        });
      }}
    >
      <RefreshCw
        className={`mr-1.5 size-4 ${running ? 'animate-spin' : ''}`}
      />
      {running ? 'Syncing…' : 'Sync with Plane'}
    </Button>
  );
};
