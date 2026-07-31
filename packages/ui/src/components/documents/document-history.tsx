import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { mapBlocksToContents } from '@colanode/client/lib';
import { DocumentUpdate } from '@colanode/client/types';
import { DocumentContent } from '@colanode/core';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@colanode/ui/components/ui/tabs';
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

type HistoryTab = 'snapshots' | 'edits';

// A short (per-minute) bucket of consecutive edits, so the fine-grained
// timeline stays readable instead of showing one row per keystroke-batch.
interface EditGroup {
  bucket: string;
  date: string;
  items: DocumentUpdate[];
}

const formatEditTime = (value: string | undefined): string => {
  if (!value) {
    return 'Unknown time';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const renderContents = (content: DocumentContent, documentId: string) => {
  const contents = mapBlocksToContents(
    documentId,
    Object.values(content.blocks)
  );

  return (
    <div className="text-foreground">
      {contents.map((node) => (
        <NodeRenderer
          key={node.attrs?.id}
          node={node}
          keyPrefix={node.attrs?.id}
        />
      ))}
    </div>
  );
};

export const DocumentHistoryDialog = ({
  documentId,
  name,
  canEdit,
  open,
  onOpenChange,
}: DocumentHistoryDialogProps) => {
  const workspace = useWorkspace();
  const [tab, setTab] = useState<HistoryTab>('snapshots');
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);
  const { mutate, isPending: isRestoring } = useMutation();

  // --- Snapshots (existing, server-side periodic captures) ---------------
  const snapshotListQuery = useQuery(
    {
      type: 'document.snapshot.list',
      documentId,
      userId: workspace.userId,
    },
    { enabled: open }
  );

  const snapshots = snapshotListQuery.data ?? [];
  const selectedSnapshotId = selectedSnapshot ?? snapshots[0]?.id ?? null;

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

  // --- Recent edits (fine-grained, per-update local timeline) ------------
  const updatesQuery = useQuery(
    {
      type: 'document.updates.list',
      documentId,
      userId: workspace.userId,
    },
    { enabled: open }
  );

  const updates = useMemo(() => updatesQuery.data ?? [], [updatesQuery.data]);

  // Newest-first list of per-minute buckets. Each bucket keeps its edits in
  // chronological order; the UI renders them newest-first within the bucket.
  const editGroups = useMemo<EditGroup[]>(() => {
    const groups: EditGroup[] = [];
    for (const update of updates) {
      const date = update.createdAt ?? '';
      const bucket = date.slice(0, 16);
      const last = groups[groups.length - 1];
      if (last && last.bucket === bucket) {
        last.items.push(update);
      } else {
        groups.push({ bucket, date, items: [update] });
      }
    }
    return groups.reverse();
  }, [updates]);

  const latestUpdateId = updates[updates.length - 1]?.id ?? null;
  const activeUpdateId = selectedUpdateId ?? latestUpdateId;

  const editContentQuery = useQuery(
    {
      type: 'document.update.content',
      documentId,
      updateId: activeUpdateId ?? '',
      userId: workspace.userId,
    },
    { enabled: open && tab === 'edits' && activeUpdateId !== null }
  );

  const editContent = editContentQuery.data ?? null;

  // --- Restore -----------------------------------------------------------
  const restoreContent: DocumentContent | null =
    tab === 'snapshots'
      ? (snapshot?.content ?? null)
      : editContent;

  const handleRestore = () => {
    if (!restoreContent || !canEdit || isRestoring) {
      return;
    }

    mutate({
      input: {
        type: 'document.restore',
        userId: workspace.userId,
        documentId,
        content: restoreContent,
      },
      onSuccess() {
        toast.success(
          tab === 'snapshots' ? 'Version restored' : 'Document restored to this edit'
        );
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

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as HistoryTab)}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <TabsList className="w-fit">
            <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
            <TabsTrigger value="edits">Recent edits</TabsTrigger>
          </TabsList>

          {/* --- Snapshots tab --- */}
          <TabsContent
            value="snapshots"
            className="flex min-h-0 flex-1 gap-4 data-[state=inactive]:hidden"
          >
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
                  onClick={() => setSelectedSnapshot(item.id)}
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
              {snapshot && renderContents(snapshot.content, documentId)}
            </div>
          </TabsContent>

          {/* --- Recent edits tab (fine-grained) --- */}
          <TabsContent
            value="edits"
            className="flex min-h-0 flex-1 gap-4 data-[state=inactive]:hidden"
          >
            <div className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r pr-2">
              {updatesQuery.isPending && (
                <div className="flex items-center justify-center p-4">
                  <Spinner />
                </div>
              )}
              {updatesQuery.isError && (
                <p className="p-2 text-sm text-muted-foreground">
                  Could not load recent edits.
                </p>
              )}
              {updatesQuery.isSuccess && updates.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">
                  No recent edits to show. Edits appear here between automatic
                  snapshots and are folded into a snapshot once they sync.
                </p>
              )}
              {editGroups.map((group) => (
                <div key={group.bucket} className="flex flex-col gap-1">
                  <div className="px-2 pt-1">
                    <NodeCollaboratorAudit
                      collaboratorId={workspace.userId}
                      date={group.date}
                    />
                  </div>
                  {[...group.items].reverse().map((item, index) => {
                    const editNumber = group.items.length - index;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          'ml-4 w-[calc(100%-1rem)] cursor-pointer rounded-md px-2 py-1 text-left text-sm hover:bg-accent',
                          item.id === activeUpdateId && 'bg-accent'
                        )}
                        onClick={() => setSelectedUpdateId(item.id)}
                      >
                        <span className="text-muted-foreground">
                          Edit {editNumber} · {formatEditTime(item.createdAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto">
              {activeUpdateId !== null && editContentQuery.isPending && (
                <div className="flex items-center justify-center p-4">
                  <Spinner />
                </div>
              )}
              {editContentQuery.isError && (
                <p className="p-2 text-sm text-muted-foreground">
                  Could not load this edit.
                </p>
              )}
              {editContentQuery.isSuccess &&
                activeUpdateId !== null &&
                editContent === null && (
                  <p className="p-2 text-sm text-muted-foreground">
                    This edit has already been folded into a snapshot and can no
                    longer be previewed individually.
                  </p>
                )}
              {editContent && renderContents(editContent, documentId)}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            type="button"
            disabled={!canEdit || !restoreContent || isRestoring}
            onClick={handleRestore}
          >
            {isRestoring && <Spinner className="mr-1" />}
            {tab === 'snapshots' ? 'Restore this version' : 'Restore to this edit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
