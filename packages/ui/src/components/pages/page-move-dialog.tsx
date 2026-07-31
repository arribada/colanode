import { eq, useLiveQuery } from '@tanstack/react-db';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { collectDescendantIds } from '@colanode/ui/lib/nodes';

interface PageMoveDialogProps {
  page: LocalPageNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PageMoveDialog = ({
  page,
  open,
  onOpenChange,
}: PageMoveDialogProps) => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();

  const spaceNodesQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.rootId, page.rootId)),
    [workspace.userId, page.rootId]
  );

  const nodes = spaceNodesQuery.data ?? [];
  const excluded = collectDescendantIds(page.id, nodes);
  excluded.add(page.id);

  const targetPages = nodes
    .filter((n) => n.type === 'page' && !excluded.has(n.id))
    .map((n) => n as LocalPageNode);

  const move = (parentId: string) => {
    mutate({
      input: {
        type: 'node.update',
        userId: workspace.userId,
        nodeId: page.id,
        attributes: {
          type: 'page',
          name: page.name,
          avatar: page.avatar ?? null,
          parentId,
        },
      },
      onSuccess: (output) => {
        if (!output.success) {
          toast.error('Move failed');
        }
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Move failed');
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Move "{page.name}"</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto py-2">
          {page.parentId !== page.rootId && (
            <button
              type="button"
              disabled={isPending}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              onClick={() => move(page.rootId)}
            >
              <span className="text-muted-foreground">Top level of space</span>
            </button>
          )}
          {targetPages.length === 0 && page.parentId === page.rootId ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No pages to move into.
            </p>
          ) : (
            targetPages.map((target) => (
              <button
                key={target.id}
                type="button"
                disabled={isPending}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                onClick={() => move(target.id)}
              >
                <Avatar
                  id={target.id}
                  name={target.name}
                  avatar={target.avatar}
                  className="size-4"
                />
                <span>{target.name}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
