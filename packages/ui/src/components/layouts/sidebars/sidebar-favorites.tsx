// ABOUTME: Collapsible "Favorites" section pinned to the top of the sidebar. Lists
// ABOUTME: the current user's starred nodes (icon + name) and navigates on click.
import { inArray, useLiveQuery } from '@tanstack/react-db';
import { ChevronRight, Star } from 'lucide-react';
import { useState } from 'react';

import { LocalNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@colanode/ui/components/ui/collapsible';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useFavorites } from '@colanode/ui/hooks/use-favorites';
import { cn } from '@colanode/ui/lib/utils';

// name/avatar live on every node variant we can favorite (page/record/…), but
// the LocalNode union does not guarantee them on all members, so read them
// through a narrow shape rather than exhausting the union.
const nodeName = (node: LocalNode): string =>
  (node as { name?: string | null }).name || 'Unnamed';
const nodeAvatar = (node: LocalNode): string | null =>
  (node as { avatar?: string | null }).avatar ?? null;

// Resolves the favorite ids to live node rows and draws the rows. Only mounted
// when there is at least one favorite, so the live query never runs on an empty
// `inArray` (which would be an invalid `IN ()`).
const SidebarFavoritesList = ({ ids }: { ids: string[] }) => {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(true);

  const nodesQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.id, ids)),
    [ids.join(',')]
  );

  const nodes = (nodesQuery.data ?? []) as LocalNode[];
  // Keep the server order (newest first); drop ids that no longer resolve to a
  // local node (deleted or not-yet-synced).
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((node): node is LocalNode => node != null);

  if (ordered.length === 0) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group/fav-header flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 transition-transform',
              open && 'rotate-90'
            )}
          />
          <Star className="size-4 shrink-0" />
          <span className="grow truncate text-left">Favorites</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex min-w-0 flex-col gap-0.5 py-0.5">
          {ordered.map((node) => (
            <li key={node.id} className="min-w-0">
              <div className="group/fav-row relative flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer has-[[aria-current=page]]:bg-sidebar-accent has-[[aria-current=page]]:text-sidebar-accent-foreground has-[[aria-current=page]]:font-medium">
                <Avatar
                  id={node.id}
                  avatar={nodeAvatar(node)}
                  name={nodeName(node)}
                  className="size-4 shrink-0"
                />
                <Link
                  from="/workspace/$userId"
                  to="$nodeId"
                  params={{ nodeId: node.id }}
                  activeProps={{ 'aria-current': 'page' }}
                  draggable={false}
                  className="min-w-0 grow"
                >
                  <span className="block w-full truncate text-left">
                    {nodeName(node)}
                  </span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const SidebarFavorites = () => {
  const workspace = useWorkspace();
  const { data: favoriteIds } = useFavorites(workspace.userId);

  if (!favoriteIds || favoriteIds.length === 0) {
    return null;
  }

  return <SidebarFavoritesList ids={favoriteIds} />;
};
