// ABOUTME: Floating action bar shown when one or more table rows are selected —
// ABOUTME: bulk delete (two-step confirm) and clear selection.
import { Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useDatabase } from '@colanode/ui/contexts/database';
import { useTableSelection } from '@colanode/ui/contexts/table-selection';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const TableSelectionBar = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const selection = useTableSelection();
  const [confirming, setConfirming] = useState(false);

  if (!selection || selection.selectedIds.size === 0) {
    return null;
  }

  const count = selection.selectedIds.size;
  const canDelete = database.canEdit && !database.isLocked;

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const ids = Array.from(selection.selectedIds);
    for (const id of ids) {
      workspace.collections.nodes.delete(id);
    }
    toast.success(`${ids.length} record${ids.length > 1 ? 's' : ''} deleted`);
    selection.clear();
    setConfirming(false);
  };

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg">
      <span className="px-1 text-sm font-medium">{count} selected</span>
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          onMouseLeave={() => setConfirming(false)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Trash2 className="size-4" />
          {confirming ? 'Confirm delete?' : 'Delete'}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          selection.clear();
          setConfirming(false);
        }}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
      >
        <X className="size-4" />
        Clear
      </button>
    </div>
  );
};
