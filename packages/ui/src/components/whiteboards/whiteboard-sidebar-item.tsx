import { LocalWhiteboardNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
import { cn } from '@colanode/ui/lib/utils';

interface WhiteboardSidebarItemProps {
  whiteboard: LocalWhiteboardNode;
}

export const WhiteboardSidebarItem = ({
  whiteboard,
}: WhiteboardSidebarItemProps) => {
  return (
    <Link
      from="/workspace/$userId"
      to="$nodeId"
      params={{ nodeId: whiteboard.id }}
      data-testid={`whiteboard-sidebar-item-${whiteboard.id}`}
      activeProps={{ 'aria-current': 'page' }}
    >
      {({ isActive }) => (
        <div
          className={cn(
            'text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
            isActive &&
              'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          )}
        >
          <Avatar
            id={whiteboard.id}
            avatar={whiteboard.avatar}
            name={whiteboard.name}
            className="size-4 shrink-0"
          />
          <span className="line-clamp-1 w-full grow text-left">
            {whiteboard.name ?? 'Unnamed'}
          </span>
        </div>
      )}
    </Link>
  );
};
