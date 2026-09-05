// ABOUTME: "Reset local data" — wipes this browser's local (OPFS) copy of the
// ABOUTME: workspaces and reloads, forcing a clean re-sync from the server.
import { useState } from 'react';

import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';

export const AccountResetLocalData = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    // Delegate to the platform-appropriate reset: on web this runs inside the
    // worker (closing the SQLite handles before deleting the OPFS databases); on
    // desktop it deletes the on-disk databases via IPC in the main process.
    await window.colanode.reset();
    window.location.reload();
  };

  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex-1 space-y-2">
        <h3 className="font-semibold">Reset local data</h3>
        <p className="text-sm text-muted-foreground">
          Clears this device&apos;s local copy of your workspaces and reloads,
          re-downloading everything fresh from the server. Use this if something
          looks out of sync or a stale item won&apos;t go away. Nothing on the
          server is deleted; you may need to sign in again.
        </p>
      </div>
      <div className="shrink-0">
        <Button
          variant="destructive"
          className="w-20"
          onClick={() => setOpen(true)}
        >
          Reset
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset local data?</DialogTitle>
            <DialogDescription>
              This wipes the local cache on this device and reloads. Nothing on
              the server is deleted — everything re-downloads. You may need to
              sign in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={reset} disabled={busy}>
              {busy ? 'Resetting…' : 'Reset & reload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
