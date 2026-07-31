import { LocalFolderNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import { cn } from '@colanode/ui/lib/utils';

interface FolderSidebarItemProps {
  folder: LocalFolderNode;
}

export const FolderSidebarItem = ({ folder }: FolderSidebarItemProps) => {
  // A folder can be picked up, but not dropped into: it holds files, and the
  // sidebar never lists its contents, so anything filed in one would disappear
  // from the tree.
  const { ref, isDragging } = useSidebarNodeDnd(folder);

  return (
    <Link
      from="/workspace/$userId"
      to="$nodeId"
      params={{ nodeId: folder.id }}
      data-testid={`folder-sidebar-item-${folder.id}`}
      activeProps={{ 'aria-current': 'page' }}
      draggable={false}
    >
      {({ isActive }) => (
        <div
          ref={ref}
          className={cn(
            'text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
            isActive &&
              'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
            isDragging && 'opacity-50'
          )}
        >
          <Avatar
            id={folder.id}
            avatar={folder.avatar}
            name={folder.name}
            className="size-4 shrink-0"
          />
          <span className="line-clamp-1 w-full grow text-left">
            {folder.name ?? 'Unnamed'}
          </span>
        </div>
      )}
    </Link>
  );
};
