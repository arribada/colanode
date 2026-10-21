import { LocalDatabaseViewNode } from '@colanode/client/types';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { ViewIcon } from '@colanode/ui/components/databases/view-icon';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMoveView } from '@colanode/ui/hooks/use-field-reorder';
import { useReorderItem } from '@colanode/ui/hooks/use-index-reorder';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';
import { cn } from '@colanode/ui/lib/utils';

interface ViewSidebarItemProps {
  view: LocalDatabaseViewNode;
}

export const ViewSidebarItem = ({ view }: ViewSidebarItemProps) => {
  const workspace = useWorkspace();
  const [activeViewId, setActiveViewId] = useMetadata<string>(
    workspace.userId,
    `${view.parentId}.activeViewId`
  );

  const isActive = view.id === activeViewId;

  // Same rule as the rest of the sidebar's drag and drop: any member but a
  // guest may arrange it; the server still checks the database's rights.
  const viewsReorder = useMoveView(
    view.parentId,
    workspace.role !== 'guest' && workspace.role !== 'none'
  );
  const dnd = useReorderItem({
    type: `view-tab:${view.parentId}`,
    id: view.id,
    axis: 'vertical',
    enabled: viewsReorder.canReorder,
    onMove: viewsReorder.move,
  });

  return (
    <div
      ref={(node) => {
        dnd.elementRef.current = node;
        dnd.drag(dnd.drop(node));
      }}
      className={cn('relative', dnd.isDragging && 'opacity-40')}
    >
      <DropIndicator edge={dnd.dropEdge} axis="vertical" />
      <Link
        draggable={false}
        from="/workspace/$userId"
        to="$nodeId"
        params={{ nodeId: view.parentId }}
        onClick={() => setActiveViewId(view.id)}
      >
        <div
          className={cn(
            'text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
            isActive &&
              'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          )}
        >
          <ViewIcon
            id={view.id}
            name={view.name}
            avatar={view.avatar}
            layout={view.layout}
            className="size-4 shrink-0"
          />
          <span className="line-clamp-1 w-full grow text-left">
            {view.name ?? 'Unnamed View'}
          </span>
        </div>
      </Link>
    </div>
  );
};
