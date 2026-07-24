import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspaceSyncActivity } from '@colanode/ui/hooks/use-workspace-sync-activity';

// Small, non-blocking status pill shown while the workspace is actively
// applying synced items -- most visible during the first (potentially
// multi-minute) sync of a large workspace, since that's when batches keep
// arriving back-to-back for a while. See useWorkspaceSyncActivity for why
// this is a running count rather than a percentage.
export const WorkspaceSyncIndicator = () => {
  const { isSyncing, itemsSynced } = useWorkspaceSyncActivity();

  if (!isSyncing) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur"
    >
      <Spinner className="size-3.5" />
      <span>
        Synchronisation en cours…
        {itemsSynced > 0 ? ` (${itemsSynced.toLocaleString()})` : null}
      </span>
    </div>
  );
};
