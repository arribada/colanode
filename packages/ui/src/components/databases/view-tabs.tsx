import { ChevronDown, GripVertical } from 'lucide-react';

import { LocalDatabaseViewNode } from '@colanode/client/types';
import { DatabasePlaneSync } from '@colanode/ui/components/databases/database-plane-sync';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { ViewCreateButton } from '@colanode/ui/components/databases/view-create-button';
import { ViewIcon } from '@colanode/ui/components/databases/view-icon';
import { ViewTab } from '@colanode/ui/components/databases/view-tab';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseViews } from '@colanode/ui/contexts/database-views';
import { useMoveView } from '@colanode/ui/hooks/use-field-reorder';
import { useReorderItem } from '@colanode/ui/hooks/use-index-reorder';
import { ReorderEdge } from '@colanode/ui/lib/reorder-index';
import { cn } from '@colanode/ui/lib/utils';

// Above this many views the inline tabs get cramped, so they collapse into a
// single dropdown showing the active view (Notion-style).
const INLINE_TABS_LIMIT = 3;

export const ViewTabs = () => {
  const database = useDatabase();
  const databaseViews = useDatabaseViews();
  const views = databaseViews.views;

  const canCreate = database.canEdit && !database.isLocked;
  const viewsReorder = useMoveView(
    database.id,
    database.canEdit && !database.isLocked
  );

  if (views.length > INLINE_TABS_LIMIT) {
    const activeView =
      views.find((view) => view.id === databaseViews.activeViewId) ?? views[0];

    return (
      <div className="flex flex-row items-center gap-2 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex cursor-pointer flex-row items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent"
            >
              {activeView && (
                <ViewIcon
                  id={activeView.id}
                  name={activeView.name}
                  avatar={activeView.avatar}
                  layout={activeView.layout}
                  className="size-4"
                />
              )}
              <span className="font-medium">{activeView?.name ?? 'Views'}</span>
              <span className="text-xs text-muted-foreground">
                {views.length}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            {views.map((view) => (
              <ViewMenuItem
                key={view.id}
                view={view}
                isActive={view.id === activeView?.id}
                onSelect={() => databaseViews.onActiveViewChange(view.id)}
                canReorder={viewsReorder.canReorder}
                onMove={viewsReorder.move}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {canCreate && <ViewCreateButton />}
        <DatabasePlaneSync />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-row items-center gap-3">
      {views.map((view) => (
        <ViewTab
          key={view.id}
          view={view}
          isActive={view.id === databaseViews.activeViewId}
          onClick={() => databaseViews.onActiveViewChange(view.id)}
          canReorder={viewsReorder.canReorder}
          onMove={viewsReorder.move}
        />
      ))}
      {canCreate && <ViewCreateButton />}
      <DatabasePlaneSync />
    </div>
  );
};

interface ViewMenuItemProps {
  view: LocalDatabaseViewNode;
  isActive: boolean;
  onSelect: () => void;
  canReorder: boolean;
  onMove: (draggedId: string, targetId: string, edge: ReorderEdge) => void;
}

// A view in the menu that replaces the tabs once there are too many: its grip
// drags it above or below another, the same order the tabs and sidebar show.
const ViewMenuItem = ({
  view,
  isActive,
  onSelect,
  canReorder,
  onMove,
}: ViewMenuItemProps) => {
  const dnd = useReorderItem({
    type: `view-tab:${view.parentId}`,
    id: view.id,
    axis: 'vertical',
    enabled: canReorder,
    onMove,
  });

  return (
    <DropdownMenuItem
      onClick={onSelect}
      data-testid={`view-menu-item-${view.id}`}
      className={cn(
        'group flex cursor-pointer flex-row items-center gap-2',
        isActive && 'bg-accent'
      )}
    >
      <div
        ref={(node) => {
          dnd.elementRef.current = node;
          dnd.drop(node);
          dnd.preview(node);
        }}
        className={cn(
          'relative flex w-full min-w-0 flex-row items-center gap-2',
          dnd.isDragging && 'opacity-40'
        )}
      >
        <DropIndicator edge={dnd.dropEdge} axis="vertical" />
        {canReorder && (
          <span
            ref={(node) => {
              dnd.drag(node);
            }}
            role="presentation"
            title="Drag to reorder"
            className="-ml-1 flex shrink-0 cursor-grab items-center text-muted-foreground opacity-0 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <GripVertical className="size-3.5" />
          </span>
        )}
        <ViewIcon
          id={view.id}
          name={view.name}
          avatar={view.avatar}
          layout={view.layout}
          className="size-4"
        />
        <span className="flex-1 truncate">{view.name}</span>
      </div>
    </DropdownMenuItem>
  );
};
