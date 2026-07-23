import { useState } from 'react';
import { toast } from 'sonner';

import { mapBlocksToContents } from '@colanode/client/lib';
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
import { NodeRenderer } from '@colanode/ui/editor/renderers/node';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { cn } from '@colanode/ui/lib/utils';

interface DocumentHistoryDialogProps {
  documentId: string;
  name: string;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DocumentHistoryDialog = ({
  documentId,
  name,
  canEdit,
  open,
  onOpenChange,
}: DocumentHistoryDialogProps) => {
  const workspace = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { mutate, isPending: isRestoring } = useMutation();

  const snapshotListQuery = useQuery(
    {
      type: 'document.snapshot.list',
      documentId,
      userId: workspace.userId,
    },
    { enabled: open }
  );

  const snapshots = snapshotListQuery.data ?? [];
  const selectedSnapshotId = selectedId ?? snapshots[0]?.id ?? null;

  const snapshotGetQuery = useQuery(
    {
      type: 'document.snapshot.get',
      documentId,
      snapshotId: selectedSnapshotId ?? '',
      userId: workspace.userId,
    },
    { enabled: open && selectedSnapshotId !== null }
  );

  const snapshot = snapshotGetQuery.data ?? null;
  const contents = snapshot
    ? mapBlocksToContents(documentId, Object.values(snapshot.content.blocks))
    : [];

  const handleRestore = () => {
    if (!snapshot || !canEdit || isRestoring) {
      return;
    }

    mutate({
      input: {
        type: 'document.restore',
        userId: workspace.userId,
        documentId,
        content: snapshot.content,
      },
      onSuccess() {
        toast.success('Version restored');
        onOpenChange(false);
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Versions of &quot;{name}&quot; are captured automatically as the
            document is edited. Restoring a version applies its content as a
            new change, so nothing is ever lost.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r pr-2">
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
                No versions yet. Versions are captured automatically a few
                hours after the document is edited.
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
                onClick={() => setSelectedId(item.id)}
              >
                <NodeCollaboratorAudit
                  collaboratorId={item.createdBy}
                  date={item.createdAt}
                />
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto">
            {selectedSnapshotId !== null && snapshotGetQuery.isPending && (
              <div className="flex items-center justify-center p-4">
                <Spinner />
              </div>
            )}
            {snapshotGetQuery.isError && (
              <p className="p-2 text-sm text-muted-foreground">
                Could not load this version.
              </p>
            )}
            {snapshot && (
              <div className="text-foreground">
                {contents.map((node) => (
                  <NodeRenderer
                    key={node.attrs?.id}
                    node={node}
                    keyPrefix={node.attrs?.id}
                  />
                ))}
              </div>
            )}
          </div>
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
