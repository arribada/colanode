import { Columns2, MoreHorizontal, Pencil, Rows2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarDropIndicator } from '@colanode/ui/components/layouts/sidebars/sidebar-drop-indicator';
import {
  InlineRenameField,
  useInlineRename,
} from '@colanode/ui/components/layouts/sidebars/sidebar-inline-rename';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Link } from '@colanode/ui/components/ui/link';
import { useSplitView } from '@colanode/ui/contexts/split-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import { cn } from '@colanode/ui/lib/utils';

interface WhiteboardSidebarItemProps {
  whiteboard: LocalWhiteboardNode;
}

export const WhiteboardSidebarItem = ({
  whiteboard,
}: WhiteboardSidebarItemProps) => {
  const workspace = useWorkspace();
  const splitView = useSplitView();
  const { ref, isDragging, dropEdge } = useSidebarNodeDnd(whiteboard);
  const { isRenaming, startRenaming, cancelRenaming, commitRenaming } =
    useInlineRename(whiteboard);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Delete soft-trashes the whiteboard; gate it on an editor-level workspace
  // role, matching how the folder sidebar item gates Delete.
  const canEdit = workspace.role !== 'guest' && workspace.role !== 'none';
  const whiteboardUrl = `/workspace/${workspace.userId}/${whiteboard.id}`;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* The row is the drag source and context target (ref); the Link wraps
            only the label span, a sibling of the rename input, so no <input> is
            nested inside the routing <a>. */}
        <div
          ref={ref}
          className={cn(
            'group/whiteboard-row relative text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
            'has-[[aria-current=page]]:bg-sidebar-accent has-[[aria-current=page]]:text-sidebar-accent-foreground has-[[aria-current=page]]:font-medium',
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
            <Link
              from="/workspace/$userId"
              to="$nodeId"
              params={{ nodeId: whiteboard.id }}
              data-testid={`whiteboard-sidebar-item-${whiteboard.id}`}
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
                {whiteboard.name || 'Unnamed'}
              </span>
            </Link>
          )}
          {/* Hover "…" menu, sibling of the Link so a click never navigates.
              Kept visible while the menu is open. Hidden during rename. */}
          {!isRenaming && (
            <div
              className={cn(
                'shrink-0 items-center gap-0.5',
                menuOpen ? 'flex' : 'hidden group-hover/whiteboard-row:flex'
              )}
            >
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Whiteboard options"
                    data-testid={`whiteboard-item-menu-${whiteboard.id}`}
                    className="flex items-center justify-center rounded-sm p-0.5 cursor-pointer hover:bg-sidebar-border"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => startRenaming()}>
                    <Pencil className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <CopyLinkAction
                    nodeId={whiteboard.id}
                    item={DropdownMenuItem}
                  />
                  {canEdit && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => startRenaming()}>
          <Pencil className="size-4" />
          Rename
        </ContextMenuItem>
        <CopyLinkAction nodeId={whiteboard.id} item={ContextMenuItem} />
        <ContextMenuItem
          onClick={() => splitView.openInSplit(whiteboardUrl, 'horizontal')}
        >
          <Columns2 className="size-4" />
          Open in split (right)
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => splitView.openInSplit(whiteboardUrl, 'vertical')}
        >
          <Rows2 className="size-4" />
          Open in split (down)
        </ContextMenuItem>
        {canEdit && (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
      {showDeleteDialog && (
        <NodeDeleteDialog
          id={whiteboard.id}
          title="Are you sure you want to delete this whiteboard?"
          description="This action cannot be undone. This whiteboard will no longer be accessible by you or others you've shared it with."
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
        />
      )}
    </ContextMenu>
  );
};
