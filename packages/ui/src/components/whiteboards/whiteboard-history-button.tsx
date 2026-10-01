// ABOUTME: Whiteboard-header control that opens the board's version history.
// ABOUTME: Surfaces the auto-captured scene snapshots, like a page's Version tag.

import { History } from 'lucide-react';
import { useState } from 'react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { WhiteboardHistoryDialog } from '@colanode/ui/components/whiteboards/whiteboard-history';

export const WhiteboardHistoryButton = ({
  whiteboard,
  role,
}: {
  whiteboard: LocalWhiteboardNode;
  role: NodeRole;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Version history"
        title="Version history"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <History className="size-3.5" />
        <span>History</span>
      </button>
      <WhiteboardHistoryDialog
        whiteboardId={whiteboard.id}
        name={whiteboard.name}
        canEdit={hasNodeRole(role, 'editor')}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
};
