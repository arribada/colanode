import { GripVertical, SquareArrowOutUpRight, Star, Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { LocalRecordNode } from '@colanode/client/types';
import { extractNodeRole, hasNodeRole } from '@colanode/core';
import { TableViewNameCell } from '@colanode/ui/components/databases/tables/table-view-name-cell';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useDatabaseViews } from '@colanode/ui/contexts/database-views';
import { useTableCellRange } from '@colanode/ui/contexts/table-cell-range';
import { useTableFill } from '@colanode/ui/contexts/table-fill';
import { useTableSelection } from '@colanode/ui/contexts/table-selection';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  useFavorites,
  useInvalidateFavorites,
} from '@colanode/ui/hooks/use-favorites';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { getRecordConditionalColorClass } from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

interface TableViewRowProps {
  index: number;
  record: LocalRecordNode;
}

export const TableViewRow = ({ index, record }: TableViewRowProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();
  // Freeze the row-number + name columns on the full-screen (non-inline)
  // table view so they stay put while the field columns scroll horizontally.
  const { inline } = useDatabaseViews();
  const frozen = !inline;
  const selection = useTableSelection();
  const selected = selection?.isSelected(record.id) ?? false;
  const fill = useTableFill();
  const range = useTableCellRange();
  const canFill = database.canEdit && !database.isLocked;
  const role = extractNodeRole(record, workspace.userId) ?? database.role;
  const colorClass = getRecordConditionalColorClass(
    record,
    view.conditionalColors,
    database.fields,
    workspace.userId
  );

  // Notion-style row quick-actions: a grip handle (left gutter, on row hover)
  // opens a dropdown, and a right-click anywhere on the row opens the same set
  // of actions via a context menu.
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Delete rights mirror record-settings.tsx: the creator, or anyone with an
  // editor (or higher) role on the record.
  const canDelete =
    record.createdBy === workspace.userId || hasNodeRole(role, 'editor');

  // Favorites: same shared live query + add/remove mutations as the page/record
  // star button (node-favorite-button.tsx), so every consumer stays in sync.
  const { data: favoriteIds } = useFavorites(workspace.userId);
  const invalidateFavorites = useInvalidateFavorites();
  const { mutate: mutateFavorite, isPending: isFavoritePending } = useMutation();
  const isFavorited = favoriteIds?.includes(record.id) ?? false;

  const toggleFavorite = () => {
    if (isFavoritePending) {
      return;
    }

    mutateFavorite({
      input: isFavorited
        ? {
            type: 'node.favorite.remove',
            userId: workspace.userId,
            nodeId: record.id,
          }
        : {
            type: 'node.favorite.add',
            userId: workspace.userId,
            nodeId: record.id,
          },
      onSuccess: () => {
        invalidateFavorites(workspace.userId);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <RecordProvider record={record} role={role}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-testid={`table-row-${record.id}`}
            className={cn(
              'group/row animate-fade-in flex flex-row items-center gap-0.5 border-b transition-colors hover:bg-muted/30',
              view.zebra && index % 2 === 1 && 'bg-muted/25',
              selected && 'bg-accent/40',
              colorClass
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center gap-0.5 text-sm text-muted-foreground',
                frozen && 'sticky left-0 z-10 bg-background',
                frozen && selected && 'bg-accent'
              )}
              style={{ width: '30px', minWidth: '30px' }}
            >
              <span
                className={cn('group-hover/row:hidden', selected && 'hidden')}
              >
                {index + 1}
              </span>
              <DropdownMenu
                open={rowMenuOpen}
                onOpenChange={setRowMenuOpen}
                modal={false}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Row actions"
                    data-testid={`table-row-actions-${record.id}`}
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded cursor-pointer hover:bg-accent hover:text-foreground',
                      'hidden group-hover/row:flex',
                      rowMenuOpen && 'flex'
                    )}
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="start" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link
                      from="/workspace/$userId/$nodeId"
                      to="modal/$modalNodeId"
                      params={{ modalNodeId: record.id }}
                      data-testid={`table-row-menu-open-${record.id}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <SquareArrowOutUpRight className="size-4" />
                      Open
                    </Link>
                  </DropdownMenuItem>
                  <CopyLinkAction nodeId={record.id} item={DropdownMenuItem} />
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer"
                    onSelect={toggleFavorite}
                  >
                    <Star
                      className={cn(
                        'size-4',
                        isFavorited && 'fill-current text-yellow-500'
                      )}
                    />
                    {isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
                  </DropdownMenuItem>
                  {canDelete && (
                    <Fragment>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="flex items-center gap-2 cursor-pointer"
                        variant="destructive"
                        data-testid={`table-row-delete-${record.id}`}
                        onSelect={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </Fragment>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                type="checkbox"
                aria-label="Select row"
                checked={selected}
                onChange={() => selection?.toggle(record.id)}
                className={cn(
                  'size-3.5 shrink-0 cursor-pointer accent-blue-600',
                  !selected && 'hidden group-hover/row:block'
                )}
              />
            </span>
            <div
              className={cn(
                'h-8 border-r overflow-hidden',
                frozen && 'sticky left-[30px] z-10 bg-background',
                frozen && selected && 'bg-accent'
              )}
              style={{ width: `${view.nameWidth}px`, minWidth: '300px' }}
            >
              <TableViewNameCell record={record} />
            </div>
            {view.fields.map((field, col) => {
              const inFillRange = fill?.isInFillRange(index, col) ?? false;
              const inRange = range?.isSelected(index, col) ?? false;
              return (
                <div
                  key={`row-${record.id}-${field.field.id}`}
                  data-cell-row={index}
                  data-cell-col={col}
                  className={cn(
                    'group/cell relative h-8 border-r p-1 overflow-hidden',
                    inFillRange && 'bg-blue-100/70 dark:bg-blue-900/40',
                    inRange &&
                      'bg-blue-200/70 ring-1 ring-inset ring-blue-400 dark:bg-blue-800/50 dark:ring-blue-500'
                  )}
                  style={{ width: `${field.width}px` }}
                  // Ctrl (or Cmd) + press starts a cell-range selection. Capture
                  // phase so it fires before the cell's own editor opens; the drag
                  // itself is tracked at the window level (see table-view.tsx).
                  onPointerDownCapture={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      range?.beginAt(index, col);
                    }
                  }}
                  onPointerEnter={() => fill?.enter(index, col)}
                >
                  <RecordFieldValue field={field.field} />
                  {canFill && (
                    <span
                      role="presentation"
                      title="Drag to fill — across rows and columns"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fill?.start(index, col);
                      }}
                      className="absolute bottom-0 right-0 size-1.5 cursor-crosshair rounded-sm bg-blue-500 opacity-0 group-hover/cell:opacity-100"
                    />
                  )}
                </div>
              );
            })}
            <div className="w-8" />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem asChild>
            <Link
              from="/workspace/$userId/$nodeId"
              to="modal/$modalNodeId"
              params={{ modalNodeId: record.id }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <SquareArrowOutUpRight className="size-4" />
              Open
            </Link>
          </ContextMenuItem>
          <CopyLinkAction nodeId={record.id} item={ContextMenuItem} />
          <ContextMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={toggleFavorite}
          >
            <Star
              className={cn(
                'size-4',
                isFavorited && 'fill-current text-yellow-500'
              )}
            />
            {isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
          </ContextMenuItem>
          {canDelete && (
            <Fragment>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="flex items-center gap-2 cursor-pointer"
                variant="destructive"
                onSelect={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </ContextMenuItem>
            </Fragment>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <NodeDeleteDialog
        id={record.id}
        title="Are you sure you want to delete this record?"
        description="This action cannot be undone. This record will no longer be accessible by you or others you've shared it with."
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      />
    </RecordProvider>
  );
};
