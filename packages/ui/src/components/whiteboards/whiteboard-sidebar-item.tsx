import { Pencil } from 'lucide-react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  InlineRenameField,
  useInlineRename,
} from '@colanode/ui/components/layouts/sidebars/sidebar-inline-rename';
import { SidebarDropIndicator } from '@colanode/ui/components/layouts/sidebars/sidebar-drop-indicator';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import { Link } from '@colanode/ui/components/ui/link';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import { cn } from '@colanode/ui/lib/utils';

interface WhiteboardSidebarItemProps {
  whiteboard: LocalWhiteboardNode;
}

export const WhiteboardSidebarItem = ({
  whiteboard,
}: WhiteboardSidebarItemProps) => {
  const { ref, isDragging, dropEdge } = useSidebarNodeDnd(whiteboard);
  const { isRenaming, startRenaming, cancelRenaming, commitRenaming } =
    useInlineRename(whiteboard);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          from="/workspace/$userId"
          to="$nodeId"
          params={{ nodeId: whiteboard.id }}
          data-testid={`whiteboard-sidebar-item-${whiteboard.id}`}
          activeProps={{ 'aria-current': 'page' }}
          draggable={false}
        >
          {({ isActive }) => (
            <div
              ref={ref}
              className={cn(
                'relative text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
                isActive &&
                  'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                isDragging && 'opacity-50'
              )}
            >
              <SidebarDropIndicator edge={dropEdge} />
              <Avatar
                id={whiteboard.id}
                avatar={whiteboard.avatar}
                name={whiteboard.name}
                className="size-4 shrink-0"
              />
              {isRenaming ? (
                <InlineRenameField
                  initialValue={whiteboard.name ?? ''}
                  onCommit={commitRenaming}
                  onCancel={cancelRenaming}
                />
              ) : (
                <span
                  className="line-clamp-1 w-full grow text-left"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startRenaming();
                  }}
                >
                  {whiteboard.name ?? 'Unnamed'}
                </span>
              )}
            </div>
          )}
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => startRenaming()}>
          <Pencil className="size-4" />
          Rename
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
