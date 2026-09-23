import { eq, useLiveQuery } from '@tanstack/react-db';
import { ChevronRight, CornerLeftUp, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { mapNodeAttributes } from '@colanode/client/lib';
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
import {
  ancestorsOf,
  buildMoveTargets,
  matchMoveTargets,
  type MoveTarget,
} from '@colanode/ui/lib/move-tree';
import { collectDescendantIds } from '@colanode/ui/lib/nodes';
import { cn } from '@colanode/ui/lib/utils';

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
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const spaceNodesQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.rootId, page.rootId)),
    [workspace.userId, page.rootId]
  );

  const nodes = useMemo(
    () => spaceNodesQuery.data ?? [],
    [spaceNodesQuery.data]
  );

  const targets = useMemo(() => {
    const excluded = collectDescendantIds(page.id, nodes);
    excluded.add(page.id);
    return buildMoveTargets(nodes, page.rootId, excluded);
  }, [nodes, page.id, page.rootId]);

  const byId = useMemo(
    () => new Map<string, MoveTarget>(targets.map((t) => [t.id, t])),
    [targets]
  );

  const avatarOf = useMemo(() => {
    const avatars = new Map<string, string | null | undefined>();
    for (const node of nodes) {
      if (node.type === 'page') {
        avatars.set(node.id, (node as LocalPageNode).avatar);
      }
    }
    return avatars;
  }, [nodes]);

  const searching = query.trim().length > 0;
  const matches = useMemo(
    () => matchMoveTargets(targets, query),
    [targets, query]
  );

  // While searching, every branch leading to a match is forced open so the
  // result is actually on screen; otherwise the tree keeps what was collapsed.
  const forcedOpen = useMemo(
    () => (searching ? ancestorsOf(matches, byId) : new Set<string>()),
    [searching, matches, byId]
  );

  const matchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);

  const visible = useMemo(() => {
    const rows: MoveTarget[] = [];
    // A page is hidden when any of its ancestors is collapsed, and, while
    // searching, when neither it nor a descendant matches.
    const hiddenUnder = new Set<string>();
    for (const target of targets) {
      const parentHidden =
        target.parentId !== null && hiddenUnder.has(target.parentId);
      const isOpen = forcedOpen.has(target.id) || !collapsed.has(target.id);
      if (parentHidden || !isOpen) {
        hiddenUnder.add(target.id);
      }
      if (parentHidden) {
        continue;
      }
      if (searching && !matchIds.has(target.id) && !forcedOpen.has(target.id)) {
        continue;
      }
      rows.push(target);
    }
    return rows;
  }, [targets, collapsed, forcedOpen, matchIds, searching]);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const move = (parentId: string) => {
    mutate({
      input: {
        type: 'node.update',
        userId: workspace.userId,
        nodeId: page.id,
        // A move changes exactly one thing: where the page hangs. Listing the
        // attributes by hand looked equivalent but was a silent delete — a page
        // also carries `cover`, `isTemplate` and its per-page `collaborators`,
        // and node.update replaces the attribute set rather than merging into it.
        // Losing the collaborators was the worst of it: for an admin the move
        // quietly revoked everyone's explicit access, and for anyone else the
        // server rejected the change outright (collaborator edits are admin-only),
        // so the move just failed with no way to tell why.
        attributes: { ...mapNodeAttributes(page), parentId },
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
      <DialogContent className="flex w-full max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>Move &quot;{page.name}&quot;</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages in this space"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex max-h-80 min-h-40 flex-col gap-0.5 overflow-y-auto py-1">
          {page.parentId !== page.rootId && !searching && (
            <button
              type="button"
              disabled={isPending}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              onClick={() => move(page.rootId)}
            >
              <CornerLeftUp className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Top level of space</span>
            </button>
          )}
          {visible.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {searching ? 'No page matches.' : 'No pages to move into.'}
            </p>
          )}
          {visible.map((target) => {
            const isOpen =
              forcedOpen.has(target.id) || !collapsed.has(target.id);
            return (
              <div
                key={target.id}
                className="flex items-center gap-0.5"
                style={{ paddingLeft: `${target.depth * 14}px` }}
              >
                {target.hasChildren && !searching ? (
                  <button
                    type="button"
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                    className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent"
                    onClick={() => toggle(target.id)}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 text-muted-foreground transition-transform',
                        isOpen && 'rotate-90'
                      )}
                    />
                  </button>
                ) : (
                  <span className="size-5 shrink-0" />
                )}
                <button
                  type="button"
                  disabled={isPending}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50',
                    searching && !matchIds.has(target.id) && 'opacity-50'
                  )}
                  onClick={() => move(target.id)}
                >
                  <Avatar
                    id={target.id}
                    name={target.name}
                    avatar={avatarOf.get(target.id)}
                    className="size-4 shrink-0"
                  />
                  <span className="truncate">{target.name}</span>
                  {searching && target.path.length > 0 && (
                    <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                      {target.path.join(' / ')}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
