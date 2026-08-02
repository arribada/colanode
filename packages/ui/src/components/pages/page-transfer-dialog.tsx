import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Button } from '@colanode/ui/components/ui/button';
import { Checkbox } from '@colanode/ui/components/ui/checkbox';
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
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { cn } from '@colanode/ui/lib/utils';

interface PageTransferDialogProps {
  page: LocalPageNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Transfer a page to another workspace: pick a destination workspace, then a
// space inside it (its contents are previewed so you can see where it lands),
// and optionally remove the original afterwards. The move is a copy under the
// hood — see PageTransferMutationHandler for why.
export const PageTransferDialog = ({
  page,
  open,
  onOpenChange,
}: PageTransferDialogProps) => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();

  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [trashOriginal, setTrashOriginal] = useState(false);

  const workspacesQuery = useLiveQuery({ type: 'workspace.list' });
  const workspaces = (workspacesQuery.data ?? []).filter(
    (w) => w.userId !== workspace.userId
  );

  const spacesQuery = useLiveQuery(
    {
      type: 'node.list',
      userId: targetUserId ?? '',
      filters: [{ field: ['type'], operator: 'eq', value: 'space' }] as never,
      sorts: [] as never,
    },
    { enabled: targetUserId != null }
  );
  const spaces = spacesQuery.data ?? [];

  const previewQuery = useLiveQuery(
    {
      type: 'node.list',
      userId: targetUserId ?? '',
      filters: [
        { field: ['parentId'], operator: 'eq', value: targetParentId ?? '' },
      ] as never,
      sorts: [] as never,
      limit: 40,
    },
    { enabled: targetUserId != null && targetParentId != null }
  );
  const existing = (previewQuery.data ?? []).filter((n) =>
    ['page', 'database', 'folder', 'whiteboard'].includes(n.type)
  );

  const reset = () => {
    setTargetUserId(null);
    setTargetParentId(null);
    setTrashOriginal(false);
  };

  const submit = () => {
    if (!targetUserId || !targetParentId) {
      return;
    }
    mutate({
      input: {
        type: 'page.transfer',
        userId: workspace.userId,
        pageId: page.id,
        targetUserId,
        targetParentId,
        trashOriginal,
      },
      onSuccess: () => {
        toast.success(
          trashOriginal
            ? 'Page moved to the other workspace.'
            : 'Page copied to the other workspace.'
        );
        reset();
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message ?? "Couldn't transfer the page.");
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) {
          if (!next) {
            reset();
          }
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">
            Transfer “{page.name ?? 'Untitled'}” to another workspace
          </DialogTitle>
          <DialogDescription>
            Copies this page and its subpages into the workspace and space you
            pick. The destination’s contents are shown so you can see where it
            lands.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {/* Step 1 — destination workspace */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Destination workspace
            </p>
            {workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don’t have another workspace to transfer to. Create one from
                the workspace menu first.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {workspaces.map((w) => (
                  <button
                    key={w.userId}
                    type="button"
                    onClick={() => {
                      setTargetUserId(w.userId);
                      setTargetParentId(null);
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                      targetUserId === w.userId && 'bg-accent'
                    )}
                  >
                    <Avatar
                      size="small"
                      id={w.workspaceId}
                      name={w.name}
                      avatar={w.avatar}
                    />
                    <span className="flex-1 truncate">{w.name}</span>
                    {targetUserId === w.userId && (
                      <Check className="size-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2 — destination space */}
          {targetUserId && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Destination space
              </p>
              {spaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This workspace has no space yet.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => setTargetParentId(space.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                        targetParentId === space.id && 'bg-accent'
                      )}
                    >
                      <Avatar
                        size="small"
                        id={space.id}
                        name={'name' in space ? space.name : 'Space'}
                        avatar={'avatar' in space ? space.avatar : undefined}
                      />
                      <span className="flex-1 truncate">
                        {'name' in space ? space.name : 'Untitled space'}
                      </span>
                      {targetParentId === space.id && (
                        <Check className="size-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview — what is already in the chosen space */}
          {targetParentId && (
            <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/30 p-2">
              <p className="text-xs font-medium text-muted-foreground">
                Already in this space
              </p>
              {existing.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This space is empty — the page will be the first item.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {existing.slice(0, 12).map((n) => (
                    <li
                      key={n.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Avatar
                        size="small"
                        id={n.id}
                        name={'name' in n ? n.name : ''}
                        avatar={'avatar' in n ? n.avatar : undefined}
                      />
                      <span className="truncate">
                        {'name' in n ? n.name : 'Untitled'}
                      </span>
                    </li>
                  ))}
                  {existing.length > 12 && (
                    <li className="text-xs text-muted-foreground">
                      …and {existing.length - 12} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={trashOriginal}
              onCheckedChange={(checked) => setTrashOriginal(checked === true)}
            />
            Remove the original after transfer (moved to this workspace’s trash)
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || !targetUserId || !targetParentId}
          >
            {isPending && <Spinner className="mr-2 size-4" />}
            {trashOriginal ? 'Move here' : 'Copy here'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
