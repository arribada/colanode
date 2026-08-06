// ABOUTME: Workspace-wide view of every shared page — the link, access level,
// ABOUTME: expiry, pending suggestions, plus open / copy / revoke.
import { useNavigate } from '@tanstack/react-router';
import { Copy, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface WorkspaceShare {
  id: string;
  token: string;
  nodeId: string;
  pageName: string;
  permission: string;
  hasPassword: boolean;
  includeSubpages: boolean;
  expiresAt: string | null;
  createdAt: string;
  pendingSuggestions: number;
}

interface SharedPagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shareUrl = (token: string) =>
  `${window.location.origin}/share/${token}`;

export const SharedPagesDialog = ({
  open,
  onOpenChange,
}: SharedPagesDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [shares, setShares] = useState<WorkspaceShare[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.colanode.executeMutation({
        type: 'node.share.workspace.list',
        userId: workspace.userId,
      });
      if (result.success) {
        setShares((result.output as { shares: WorkspaceShare[] }).shares);
      }
    } catch {
      // keep whatever is shown
    } finally {
      setLoading(false);
    }
  }, [workspace.userId]);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  const revoke = async (shareId: string) => {
    try {
      await window.colanode.executeMutation({
        type: 'node.share.revoke',
        userId: workspace.userId,
        shareId,
      });
      await refresh();
    } catch {
      toast.error('Could not revoke the link');
    }
  };

  const openPage = (nodeId: string) => {
    onOpenChange(false);
    navigate({
      to: '/workspace/$userId/$nodeId',
      params: { userId: workspace.userId, nodeId },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Shared pages</DialogTitle>
          <DialogDescription>
            Every page currently shared to the web from this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          )}
          {!loading && shares.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No pages are shared yet.
            </p>
          )}
          {shares.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md border p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{s.pageName}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {s.permission === 'suggest' ? 'Suggestions' : 'Read-only'}
                  </span>
                  {s.hasPassword && (
                    <span className="text-xs" title="Password protected">
                      🔒
                    </span>
                  )}
                  {s.pendingSuggestions > 0 && (
                    <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs text-white">
                      {s.pendingSuggestions} pending
                    </span>
                  )}
                </div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {shareUrl(s.token)}
                  {s.expiresAt
                    ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}`
                    : ' · no expiry'}
                </div>
              </div>
              <button
                type="button"
                aria-label="Open page"
                onClick={() => openPage(s.nodeId)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Copy link"
                onClick={() => {
                  void navigator.clipboard?.writeText(shareUrl(s.token));
                  toast.success('Link copied');
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Revoke link"
                onClick={() => revoke(s.id)}
                className="shrink-0 text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
