import { Maximize2, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { mapBlocksToContents } from '@colanode/client/lib';
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

type HistoryTab = 'versions' | 'snapshots' | 'edits';

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
  const [tab, setTab] = useState<HistoryTab>('versions');
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const { mutate, isPending: isRestoring } = useMutation();

  // --- Snapshots (server-side captures, tagged or automatic) -------------
  const snapshotListQuery = useQuery(
    {
      type: 'document.snapshot.list',
      documentId,
      userId: workspace.userId,
    },
    { enabled: open }
  );

  const snapshots = useMemo(
    () => snapshotListQuery.data ?? [],
    [snapshotListQuery.data]
  );

  // A version somebody cut on purpose, with the tag and the changelog written
  // at the time. Everything else is an automatic capture.
  const versions = useMemo(
    () => snapshots.filter((item) => item.name),
    [snapshots]
  );

  // Open on the tagged versions when there are any: that is the list people
  // mean by "history". Falling back keeps an untagged page working as before.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (snapshotListQuery.isSuccess) {
      setTab(versions.length > 0 ? 'versions' : 'snapshots');
    }
  }, [open, snapshotListQuery.isSuccess, versions.length]);

  const selectedSnapshotId = selectedSnapshot ?? snapshots[0]?.id ?? null;
  const selectedVersionId = selectedVersion ?? versions[0]?.id ?? null;
  const activeSnapshotId =
    tab === 'versions' ? selectedVersionId : selectedSnapshotId;

  const snapshotGetQuery = useQuery(
    {
      type: 'document.snapshot.get',
      documentId,
      snapshotId: activeSnapshotId ?? '',
      userId: workspace.userId,
    },
    { enabled: open && tab !== 'edits' && activeSnapshotId !== null }
  );

  const snapshot = snapshotGetQuery.data ?? null;
  const activeVersion = versions.find((item) => item.id === selectedVersionId);

  // --- Recent edits ------------------------------------------------------
  // Read from the server, not from this device. A client that was handed a
  // merged state has no per-edit rows of its own, which is why this list used
  // to come up empty on a phone or in a fresh browser.
  const updatesQuery = useQuery(
    {
      type: 'document.server.update.list',
      documentId,
      userId: workspace.userId,
    },
    { enabled: open && tab === 'edits' }
  );

  const updates = useMemo(() => updatesQuery.data ?? [], [updatesQuery.data]);

  // Newest first, grouped per day so a long list stays readable.
  const editGroups = useMemo(() => {
    const groups: { day: string; items: typeof updates }[] = [];
    for (const update of [...updates].reverse()) {
      const day = (update.createdAt ?? '').slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.day === day) {
        last.items.push(update);
      } else {
        groups.push({ day, items: [update] });
      }
    }
    return groups;
  }, [updates]);

  const latestUpdateId = updates[updates.length - 1]?.id ?? null;
  const activeUpdateId = selectedUpdateId ?? latestUpdateId;

  const editContentQuery = useQuery(
    {
      type: 'document.server.update.get',
      documentId,
      updateId: activeUpdateId ?? '',
      userId: workspace.userId,
    },
    { enabled: open && tab === 'edits' && activeUpdateId !== null }
  );

  const editContent = editContentQuery.data?.content ?? null;

  // --- Restore -----------------------------------------------------------
  const restoreContent: DocumentContent | null =
    tab === 'edits' ? editContent : (snapshot?.content ?? null);

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
          tab === 'edits'
            ? 'Document restored to this edit'
            : 'Version restored'
        );
        onOpenChange(false);
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  // Escape closes the full-screen reader first, not the dialog under it.
  useEffect(() => {
    if (!fullScreen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setFullScreen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullScreen]);

  const previewTitle =
    tab === 'versions'
      ? (activeVersion?.name ?? 'Version')
      : tab === 'snapshots'
        ? 'Snapshot'
        : 'Edit';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[80vh] flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Versions of &quot;{name}&quot; are captured automatically as the
              document is edited, and whenever someone cuts a version tag from
              the page header. Restoring a version applies its content as a new
              change, so nothing is ever lost.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as HistoryTab)}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <TabsList className="w-fit">
              <TabsTrigger value="versions">
                Tags{versions.length > 0 ? ` (${versions.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
              <TabsTrigger value="edits">Recent edits</TabsTrigger>
            </TabsList>

            {/* --- Tagged versions --- */}
            <TabsContent
              value="versions"
              className="flex min-h-0 flex-1 gap-4 data-[state=inactive]:hidden"
            >
              <div className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r pr-2">
                {snapshotListQuery.isPending && (
                  <div className="flex items-center justify-center p-4">
                    <Spinner />
                  </div>
                )}
                {snapshotListQuery.isSuccess && versions.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">
                    No version has been tagged yet. Cut one from the version
                    button in the page header: it records the page as it stands,
                    under a tag, with the changelog you write with it.
                  </p>
                )}
                {versions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'w-full cursor-pointer rounded-md p-2 text-left hover:bg-accent',
                      item.id === selectedVersionId && 'bg-accent'
                    )}
                    onClick={() => setSelectedVersion(item.id)}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                      <Tag className="size-3.5 text-muted-foreground" />
                      {item.name}
                    </div>
                    <NodeCollaboratorAudit
                      collaboratorId={item.createdBy}
                      date={item.createdAt}
                    />
                    {item.note && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {item.note}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto">
                {activeVersion?.note && (
                  <div className="mb-3 rounded-md border border-border bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      What changed in {activeVersion.name}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {activeVersion.note}
                    </p>
                  </div>
                )}
                {activeSnapshotId !== null && snapshotGetQuery.isPending && (
                  <div className="flex items-center justify-center p-4">
                    <Spinner />
                  </div>
                )}
                {snapshot && renderContents(snapshot.content, documentId)}
              </div>
            </TabsContent>

            {/* --- Automatic snapshots --- */}
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
                    {item.name && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold tabular-nums">
                        <Tag className="size-3 text-muted-foreground" />
                        {item.name}
                      </div>
                    )}
                    <NodeCollaboratorAudit
                      collaboratorId={item.createdBy}
                      date={item.createdAt}
                    />
                  </button>
                ))}
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto">
                {activeSnapshotId !== null && snapshotGetQuery.isPending && (
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

            {/* --- Recent edits (fine-grained, from the server) --- */}
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
                    No individual edits are kept for this page any more. They
                    are folded into a snapshot a couple of hours after they are
                    made; look under Snapshots for what came before.
                  </p>
                )}
                {editGroups.map((group) => (
                  <div key={group.day} className="flex flex-col gap-1">
                    <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">
                      {group.day
                        ? new Date(group.day).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })
                        : 'Unknown date'}
                    </div>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          'ml-2 w-[calc(100%-0.5rem)] cursor-pointer rounded-md px-2 py-1 text-left hover:bg-accent',
                          item.id === activeUpdateId && 'bg-accent'
                        )}
                        onClick={() => setSelectedUpdateId(item.id)}
                      >
                        <NodeCollaboratorAudit
                          collaboratorId={item.createdBy}
                          date={item.createdAt}
                        />
                        <span className="text-xs text-muted-foreground">
                          {formatEditTime(item.createdAt)}
                          {item.mergedCount > 1
                            ? ` · ${item.mergedCount} edits folded together`
                            : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto">
                {activeUpdateId !== null && editContentQuery.isPending && (
                  <div className="flex items-center justify-center p-4">
                    <Spinner />
                  </div>
                )}
                {editContentQuery.isSuccess &&
                  activeUpdateId !== null &&
                  editContent === null && (
                    <p className="p-2 text-sm text-muted-foreground">
                      This edit is no longer kept on its own.
                    </p>
                  )}
                {editContent && renderContents(editContent, documentId)}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={!restoreContent}
              onClick={() => setFullScreen(true)}
            >
              <Maximize2 className="mr-1 size-4" />
              View full screen
            </Button>
            <Button
              type="button"
              disabled={!canEdit || !restoreContent || isRestoring}
              onClick={handleRestore}
            >
              {isRestoring && <Spinner className="mr-1" />}
              {tab === 'edits'
                ? 'Restore to this edit'
                : 'Restore this version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {fullScreen && restoreContent && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur">
            <span className="truncate text-sm text-muted-foreground">
              {name}
              <span className="text-foreground"> · {previewTitle}</span>
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setFullScreen(false)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
              Close
            </button>
          </div>
          <div className="mx-auto w-full max-w-3xl px-6 py-10">
            {renderContents(restoreContent, documentId)}
          </div>
        </div>
      )}
    </>
  );
};
