import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import {
  LocalDatabaseNode,
  LocalDatabaseViewNode,
} from '@colanode/client/types';
import { compareString } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@colanode/ui/components/ui/collapsible';
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

  // Re-filable like a page, but nothing gets dropped into a database from here.
  const { ref, isDragging } = useSidebarNodeDnd(database);

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
      <Link
        from="/workspace/$userId"
        to="$nodeId"
        params={{ nodeId: database.id }}
        draggable={false}
      >
        {({ isActive }) => (
          <div
            ref={ref}
            className={cn(
              'group/database-row text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
              isActive &&
                'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
              isDragging && 'opacity-50'
            )}
          >
            {hasViews ? (
              <CollapsibleTrigger asChild>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(!open);
                  }}
                  className="flex items-center cursor-pointer rounded-sm hover:bg-sidebar-border"
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
                className="size-4"
              />
            )}
            <span className="line-clamp-1 w-full grow text-left">
              {database.name ?? 'Unnamed'}
            </span>
          </div>
        )}
      </Link>
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
