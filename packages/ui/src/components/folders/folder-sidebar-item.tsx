import { useNavigate } from '@tanstack/react-router';
import {
  ChevronRight,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalFolderNode, LocalPageNode } from '@colanode/client/types';
import { generateId, IdType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarDropIndicator } from '@colanode/ui/components/layouts/sidebars/sidebar-drop-indicator';
import {
  InlineRenameField,
  useInlineRename,
} from '@colanode/ui/components/layouts/sidebars/sidebar-inline-rename';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Link } from '@colanode/ui/components/ui/link';
import { useSidebarTree } from '@colanode/ui/contexts/sidebar-tree';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import { cn } from '@colanode/ui/lib/utils';

interface FolderSidebarItemProps {
  folder: LocalFolderNode;
}

// What a folder shows underneath it in the sidebar: the movable, sidebar-listed
// node types. Files still live inside the folder and are opened from the folder
// view, so they never make it into the tree — but a page/folder/database/
// whiteboard dragged in must appear, or it would silently vanish from the tree.
const FOLDER_CHILD_TYPES = ['page', 'folder', 'database', 'whiteboard'];

export const FolderSidebarItem = ({ folder }: FolderSidebarItemProps) => {
  const workspace = useWorkspace();
  const tree = useSidebarTree();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { isRenaming, startRenaming, cancelRenaming, commitRenaming } =
    useInlineRename(folder);

  // A folder is both a thing you can pick up and a place you can drop into: a
  // node dropped in the middle band re-files under it (the reparent handler
  // lives in useSidebarNodeDnd), and its contents are listed below so nothing
  // dropped in disappears from the tree.
  const { ref, isDragging, isDropInside, dropEdge } = useSidebarNodeDnd(folder, {
    droppable: true,
  });

  const children = tree
    .childrenOf(folder.id)
    .filter((child) => FOLDER_CHILD_TYPES.includes(child.type));
  const hasChildren = children.length > 0;

  // Deleting soft-trashes the folder and its descendants together (they restore
  // together too), so it never orphans children. Gated on an editor-level role,
  // matching how the page settings menu gates Delete.
  const canEdit = workspace.role !== 'guest' && workspace.role !== 'none';

  // "+ page": create a blank child page under this folder and open it — the same
  // local insert the page item uses for a subpage, just parented to the folder.
  const handleCreatePage = () => {
    const nodes = workspace.collections.nodes;
    const childId = generateId(IdType.Page);

    const child: LocalPageNode = {
      id: childId,
      type: 'page',
      name: '',
      avatar: null,
      parentId: folder.id,
      rootId: folder.rootId,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    try {
      nodes.insert(child);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create page'
      );
      return;
    }

    setOpen(true);
    navigate({
      to: '$nodeId',
      params: {
        nodeId: childId,
      },
    });
  };

  // "+ folder": create a blank child folder under this one and open it — the
  // same local insert folder-create-dialog uses, parented to this folder.
  const handleCreateFolder = () => {
    const nodes = workspace.collections.nodes;
    const childId = generateId(IdType.Folder);

    const child: LocalFolderNode = {
      id: childId,
      type: 'folder',
      name: '',
      avatar: null,
      parentId: folder.id,
      rootId: folder.rootId,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    try {
      nodes.insert(child);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create folder'
      );
      return;
    }

    setOpen(true);
    navigate({
      to: '$nodeId',
      params: {
        nodeId: childId,
      },
    });
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/folder-item w-full"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* The row is the drag source and drop target (ref), the relative box
              the drop indicator draws into, and the hover group. The disclosure
              toggle, the Link, and the hover actions are siblings inside it so
              no <button>/<input> is nested in the routing <a>. */}
          <div
            ref={ref}
            className={cn(
              'group/folder-row relative text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
              'has-[[aria-current=page]]:bg-sidebar-accent has-[[aria-current=page]]:text-sidebar-accent-foreground has-[[aria-current=page]]:font-medium',
              isDragging && 'opacity-50',
              isDropInside && 'bg-sidebar-accent ring-1 ring-sidebar-ring'
            )}
          >
            <SidebarDropIndicator edge={dropEdge} />
            {hasChildren ? (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={open ? 'Collapse contents' : 'Expand contents'}
                  className="flex shrink-0 items-center cursor-pointer rounded-sm hover:bg-sidebar-border"
                >
                  <Avatar
                    id={folder.id}
                    avatar={folder.avatar}
                    name={folder.name}
                    className="group-hover/folder-row:hidden size-4 shrink-0"
                  />
                  <ChevronRight className="hidden transition-transform group-hover/folder-row:block group-data-[state=open]/folder-item:rotate-90 size-4 shrink-0" />
                </button>
              </CollapsibleTrigger>
            ) : (
              <Avatar
                id={folder.id}
                avatar={folder.avatar}
                name={folder.name}
                className="size-4 shrink-0"
              />
            )}
            {isRenaming ? (
              <InlineRenameField
                initialValue={folder.name ?? ''}
                onCommit={commitRenaming}
                onCancel={cancelRenaming}
              />
            ) : (
              <Link
                from="/workspace/$userId"
                to="$nodeId"
                params={{ nodeId: folder.id }}
                data-testid={`folder-sidebar-item-${folder.id}`}
                activeProps={{ 'aria-current': 'page' }}
                draggable={false}
                className="min-w-0 grow"
              >
                <span
                  className="line-clamp-1 block w-full text-left"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startRenaming();
                  }}
                >
                  {folder.name || 'Unnamed'}
                </span>
              </Link>
            )}
            {/* Hover actions, siblings of the Link so a click never navigates.
                Kept visible while the "…" menu is open. Hidden during rename. */}
            {!isRenaming && (
              <div
                className={cn(
                  'shrink-0 items-center gap-0.5',
                  menuOpen ? 'flex' : 'hidden group-hover/folder-row:flex'
                )}
              >
                <button
                  type="button"
                  aria-label="Create page"
                  className="flex items-center justify-center rounded-sm p-0.5 cursor-pointer hover:bg-sidebar-border"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreatePage();
                  }}
                >
                  <Plus className="size-4" />
                </button>
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Folder options"
                      data-testid={`folder-item-menu-${folder.id}`}
                      className="flex items-center justify-center rounded-sm p-0.5 cursor-pointer hover:bg-sidebar-border"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => handleCreatePage()}>
                      <FilePlus className="size-4" />
                      New page
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleCreateFolder()}>
                      <FolderPlus className="size-4" />
                      New folder
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => startRenaming()}>
                      <Pencil className="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <CopyLinkAction nodeId={folder.id} item={DropdownMenuItem} />
                    {canEdit && (
                      <DropdownMenuItem
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
          <ContextMenuItem onClick={() => handleCreatePage()}>
            <FilePlus className="size-4" />
            New page
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleCreateFolder()}>
            <FolderPlus className="size-4" />
            New folder
          </ContextMenuItem>
          <ContextMenuItem onClick={() => startRenaming()}>
            <Pencil className="size-4" />
            Rename
          </ContextMenuItem>
          <CopyLinkAction nodeId={folder.id} item={ContextMenuItem} />
          {canEdit && (
            <ContextMenuItem onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="size-4" />
              Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {hasChildren && (
        <CollapsibleContent>
          <ul className="ml-3 flex min-w-0 flex-col gap-0.5 py-0.5">
            {children.map((child) => (
              <li key={child.id} className="min-w-0">
                <SidebarItem node={child} />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      )}
      {showDeleteDialog && (
        <NodeDeleteDialog
          id={folder.id}
          title="Are you sure you want to delete this folder?"
          description="This action cannot be undone. This folder and everything inside it will no longer be accessible by you or others you've shared it with."
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
        />
      )}
    </Collapsible>
  );
};
