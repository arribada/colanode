import { ChevronRight, Pencil } from 'lucide-react';
import { useState } from 'react';

import {
  LocalDatabaseNode,
  LocalDatabaseViewNode,
} from '@colanode/client/types';
import { compareString } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import {
  InlineRenameField,
  useInlineRename,
} from '@colanode/ui/components/layouts/sidebars/sidebar-inline-rename';
import { SidebarDropIndicator } from '@colanode/ui/components/layouts/sidebars/sidebar-drop-indicator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@colanode/ui/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import { Link } from '@colanode/ui/components/ui/link';
import { useSidebarTree } from '@colanode/ui/contexts/sidebar-tree';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import { cn } from '@colanode/ui/lib/utils';

interface DatabaseSidebarItemProps {
  database: LocalDatabaseNode;
}

export const DatabaseSidebarItem = ({ database }: DatabaseSidebarItemProps) => {
  const tree = useSidebarTree();
  const [open, setOpen] = useState(false);
  const { isRenaming, startRenaming, cancelRenaming, commitRenaming } =
    useInlineRename(database);

  // Re-filable and reorderable like a page, but nothing gets dropped into a
  // database from here.
  const { ref, isDragging, dropEdge } = useSidebarNodeDnd(database);

  // filter() copies, so sorting here never disturbs the shared tree index.
  const views = tree
    .childrenOf(database.id)
    .filter(
      (child): child is LocalDatabaseViewNode => child.type === 'database_view'
    )
    .sort((a, b) => compareString(a.index, b.index));
  const hasViews = views.length > 0;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/database-item w-full"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* The row is the drag source and context target (ref). The chevron
              toggle, the Link (wrapping only the label) and the rename input are
              now siblings inside it, so no <button>/<input> is nested in the
              routing <a>. */}
          <div
            ref={ref}
            className={cn(
              'group/database-row relative text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
              // The child Link carries aria-current on its active route; the row
              // highlights off of it (replaces the old isActive render-prop).
              'has-[[aria-current=page]]:bg-sidebar-accent has-[[aria-current=page]]:text-sidebar-accent-foreground has-[[aria-current=page]]:font-medium',
              isDragging && 'opacity-50'
            )}
          >
            <SidebarDropIndicator edge={dropEdge} />
            {hasViews ? (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={open ? 'Collapse views' : 'Expand views'}
                  className="flex shrink-0 items-center cursor-pointer rounded-sm hover:bg-sidebar-border"
                >
                  <Avatar
                    id={database.id}
                    avatar={database.avatar}
                    name={database.name}
                    className="group-hover/database-row:hidden size-4 shrink-0"
                  />
                  <ChevronRight className="hidden transition-transform group-hover/database-row:block group-data-[state=open]/database-item:rotate-90 size-4 shrink-0" />
                </button>
              </CollapsibleTrigger>
            ) : (
              <Avatar
                id={database.id}
                avatar={database.avatar}
                name={database.name}
                className="size-4 shrink-0"
              />
            )}
            {isRenaming ? (
              <InlineRenameField
                initialValue={database.name ?? ''}
                onCommit={commitRenaming}
                onCancel={cancelRenaming}
              />
            ) : (
              <Link
                from="/workspace/$userId"
                to="$nodeId"
                params={{ nodeId: database.id }}
                activeProps={{ 'aria-current': 'page' }}
                draggable={false}
                className="min-w-0 grow"
              >
                <span
                  className="truncate block w-full text-left"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startRenaming();
                  }}
                >
                  {database.name || 'Unnamed'}
                </span>
              </Link>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => startRenaming()}>
            <Pencil className="size-4" />
            Rename
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {hasViews && (
        <CollapsibleContent>
          <ul className="ml-3 flex min-w-0 flex-col gap-0.5 py-0.5">
            {views.map((view) => (
              <li key={view.id}>
                <SidebarItem node={view} />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};
