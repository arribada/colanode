import { LocalDatabaseViewNode } from '@colanode/client/types';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { ViewIcon } from '@colanode/ui/components/databases/view-icon';
import { useReorderItem } from '@colanode/ui/hooks/use-index-reorder';
import { ReorderEdge } from '@colanode/ui/lib/reorder-index';
import { cn } from '@colanode/ui/lib/utils';

interface ViewTabProps {
  view: LocalDatabaseViewNode;
  isActive: boolean;
  onClick: () => void;
  // Drag a tab before or after another to reorder the database's views.
  canReorder: boolean;
  onMove: (draggedId: string, targetId: string, edge: ReorderEdge) => void;
}

export const ViewTab = ({
  view,
  isActive,
  onClick,
  canReorder,
  onMove,
}: ViewTabProps) => {
  const dnd = useReorderItem({
    type: `view-tab:${view.parentId}`,
    id: view.id,
    axis: 'horizontal',
    enabled: canReorder,
    onMove,
  });

  return (
    <div
      ref={(node) => {
        dnd.elementRef.current = node;
        dnd.drag(dnd.drop(node));
      }}
      role="presentation"
      data-testid={`view-tab-${view.id}`}
      className={cn(
        'relative inline-flex min-w-0 max-w-40 cursor-pointer flex-row items-center gap-1 border-b-2 p-1 pl-0 text-sm',
        isActive ? 'border-border' : 'border-transparent',
        dnd.isDragging && 'opacity-40'
      )}
      onClick={() => onClick()}
      onKeyDown={() => onClick()}
    >
      <ViewIcon
        id={view.id}
        name={view.name}
        avatar={view.avatar}
        layout={view.layout}
        className="size-4 shrink-0"
      />
      <span className="truncate">{view.name}</span>
      <DropIndicator edge={dnd.dropEdge} axis="horizontal" />
    </div>
  );
};
