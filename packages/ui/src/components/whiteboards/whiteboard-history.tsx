import { useState } from 'react';
import { toast } from 'sonner';

import { BoardScene } from '@colanode/core';
import { NodeCollaboratorAudit } from '@colanode/ui/components/collaborators/node-collaborator-audit';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { cn } from '@colanode/ui/lib/utils';

interface WhiteboardHistoryDialogProps {
  whiteboardId: string;
  name: string;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Reads a board scene out of a snapshot's attributes. Snapshots store the raw
// node attributes (a permissive record), so the scene is read defensively.
const readScene = (
  attributes: Record<string, unknown> | undefined
): BoardScene => {
  if (!attributes) {
    return {};
  }
  const scene = attributes['scene'];
  if (!scene || typeof scene !== 'object') {
    return {};
  }
  return scene as BoardScene;
};

export const WhiteboardHistoryDialog = ({
  whiteboardId,
  name,
  canEdit,
  open,
  onOpenChange,
}: WhiteboardHistoryDialogProps) => {
  const workspace = useWorkspace();
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const snapshotListQuery = useQuery(
    {
      type: 'node.snapshot.list',
      nodeId: whiteboardId,
      userId: workspace.userId,
    },
    { enabled: open }
  );

  const snapshots = snapshotListQuery.data ?? [];
  const selectedSnapshotId = selectedSnapshot ?? snapshots[0]?.id ?? null;

  const snapshotGetQuery = useQuery(
    {
      type: 'node.snapshot.get',
      nodeId: whiteboardId,
      snapshotId: selectedSnapshotId ?? '',
      userId: workspace.userId,
    },
    { enabled: open && selectedSnapshotId !== null }
  );

  const snapshot = snapshotGetQuery.data ?? null;

  // Restore reuses the SAME persistence path the live canvas uses to write a
  // scene change: a tanstack-db update on the nodes collection that sets
  // `draft.scene`. Writing the whole scene at once produces a single node
  // update / CRDT diff, so the restore syncs like any other board edit and
  // nothing is lost.
  const handleRestore = () => {
    if (!snapshot || !canEdit || isRestoring) {
      return;
    }

    const scene = readScene(snapshot.attributes);
    const nodes = workspace.collections.nodes;
    if (!nodes.has(whiteboardId)) {
      toast.error('Open the whiteboard to restore a version');
      return;
    }

    setIsRestoring(true);
    try {
      nodes.update(whiteboardId, (draft) => {
        if (draft.type !== 'whiteboard') {
          return;
        }
        draft.scene = scene;
      });
      toast.success('Version restored');
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not restore version'
      );
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Versions of &quot;{name}&quot; are captured automatically as the
            whiteboard is edited. Restoring a version applies its scene as a new
            change, so nothing is ever lost.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {snapshotListQuery.isPending && (
            <div className="flex items-center justify-center p-4">
              <Spinner />
            </div>
          )}
          {snapshotListQuery.isError && (
            <p className="p-2 text-sm text-muted-foreground">
              Could not load version history.
            </p>
          )}
          {snapshotListQuery.isSuccess && snapshots.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No versions yet. Versions are captured automatically a few hours
              after the whiteboard is edited.
            </p>
          )}
          {snapshots.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'w-full cursor-pointer rounded-md p-2 text-left hover:bg-accent',
                item.id === selectedSnapshotId && 'bg-accent'
              )}
              onClick={() => setSelectedSnapshot(item.id)}
            >
              <NodeCollaboratorAudit
                collaboratorId={item.createdBy}
                date={item.createdAt}
              />
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!canEdit || !snapshot || isRestoring}
            onClick={handleRestore}
          >
            {isRestoring && <Spinner className="mr-1" />}
            Restore this version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
