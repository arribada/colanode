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

// Delete every entry in the origin-private file system (where the web client
// keeps its local SQLite databases). Structural typing keeps this free of the
// not-always-present DOM lib types for the File System Access API.
const wipeLocalStorage = async (): Promise<void> => {
  try {
    const storage = navigator.storage as unknown as {
      getDirectory?: () => Promise<{
        entries: () => AsyncIterable<[string, unknown]>;
        removeEntry: (
          name: string,
          opts: { recursive: boolean }
        ) => Promise<void>;
      }>;
    };
    if (!storage.getDirectory) {
      return;
    }
    const root = await storage.getDirectory();
    for await (const [name] of root.entries()) {
      await root.removeEntry(name, { recursive: true }).catch(() => {});
    }
  } catch {
    // best-effort — reload anyway so a partial wipe still recovers
  }
};

export const AccountResetLocalData = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    await wipeLocalStorage();
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
