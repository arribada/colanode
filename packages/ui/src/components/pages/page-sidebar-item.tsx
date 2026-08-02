import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRightLeft,
  ChevronRight,
  Copy,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { generateId, IdType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarDropIndicator } from '@colanode/ui/components/layouts/sidebars/sidebar-drop-indicator';
import {
  InlineRenameField,
  useInlineRename,
} from '@colanode/ui/components/layouts/sidebars/sidebar-inline-rename';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
import { PageMoveDialog } from '@colanode/ui/components/pages/page-move-dialog';
import { PageTransferDialog } from '@colanode/ui/components/pages/page-transfer-dialog';
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
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import { cn } from '@colanode/ui/lib/utils';

interface PageSidebarItemProps {
  page: LocalPageNode;
}

// What a page shows underneath it. Files live in folders and are opened from the
// folder view, so they never make it into the tree.
const PAGE_CHILD_TYPES = ['page', 'database', 'folder'];

export const PageSidebarItem = ({ page }: PageSidebarItemProps) => {
  const workspace = useWorkspace();
  const tree = useSidebarTree();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { mutate: duplicatePage, isPending: isDuplicating } = useMutation();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const { isRenaming, startRenaming, cancelRenaming, commitRenaming } =
    useInlineRename(page);

  // A page is both a thing you can pick up and a place you can drop into.
  const { ref, isDragging, isDropInside, dropEdge } = useSidebarNodeDnd(page, {
    droppable: true,
  });

  const children = tree
    .childrenOf(page.id)
    .filter((child) => PAGE_CHILD_TYPES.includes(child.type));
  const hasChildren = children.length > 0;

  // Shared by the right-click context menu and the hover "…" menu so both offer
  // exactly the same actions.
  const handleDuplicate = () => {
    if (isDuplicating) {
      return;
    }

    duplicatePage({
      input: {
        type: 'page.duplicate',
        userId: workspace.userId,
        pageId: page.id,
      },
      onSuccess(output) {
        navigate({
          to: '$nodeId',
          params: {
            nodeId: output.id,
          },
        });
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  // "+ subpage": create a blank child page under this one and open it — the same
  // local insert the space dropdown uses to add a page, just parented here.
  const handleCreateSubpage = () => {
    const nodes = workspace.collections.nodes;
    const childId = generateId(IdType.Page);

    const child: LocalPageNode = {
      id: childId,
      type: 'page',
      name: '',
      avatar: null,
      parentId: page.id,
      rootId: page.rootId,
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
        error instanceof Error ? error.message : 'Could not create subpage'
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
      className="group/page-item w-full"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* The row itself is the drag source and drop target (ref), the
              relative box the drop indicator draws into, and the hover group.
              The disclosure toggle and the Link are now siblings inside it, so
              the toggle is no longer a <button> nested in an <a>. */}
          <div
            ref={ref}
            className={cn(
              'group/page-row relative text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
              // Active row: the child Link carries aria-current on its route, and
              // the whole row highlights off of it (replaces the old isActive
              // render-prop, which is gone now that the Link wraps only the label).
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
                  aria-label={open ? 'Collapse subpages' : 'Expand subpages'}
                  className="flex shrink-0 items-center cursor-pointer rounded-sm hover:bg-sidebar-border"
                >
                  <Avatar
                    id={page.id}
                    avatar={page.avatar}
                    name={page.name}
                    className="group-hover/page-row:hidden size-4 shrink-0"
                  />
                  <ChevronRight className="hidden transition-transform group-hover/page-row:block group-data-[state=open]/page-item:rotate-90 size-4 shrink-0" />
                </button>
              </CollapsibleTrigger>
            ) : (
              <Avatar
                id={page.id}
                avatar={page.avatar}
                name={page.name}
                className="size-4 shrink-0"
              />
            )}
            {isRenaming ? (
              <InlineRenameField
                initialValue={page.name ?? ''}
                onCommit={commitRenaming}
                onCancel={cancelRenaming}
              />
            ) : (
              <Link
                from="/workspace/$userId"
                to="$nodeId"
                params={{ nodeId: page.id }}
                data-testid={`page-item-${page.id}`}
                activeProps={{ 'aria-current': 'page' }}
                // The row is the drag source; keep the browser from choosing to
                // drag the anchor instead.
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
                  {page.name || 'Unnamed'}
                </span>
              </Link>
            )}
            {/* Hover actions, siblings of the Link so a click never navigates.
                Kept visible while the "…" menu is open. Hidden during rename. */}
            {!isRenaming && (
              <div
                className={cn(
                  'shrink-0 items-center gap-0.5',
                  menuOpen ? 'flex' : 'hidden group-hover/page-row:flex'
                )}
              >
                <button
                  type="button"
                  aria-label="Create subpage"
                  className="flex items-center justify-center rounded-sm p-0.5 cursor-pointer hover:bg-sidebar-border"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreateSubpage();
                  }}
                >
                  <Plus className="size-4" />
                </button>
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Page options"
                      data-testid={`page-item-menu-${page.id}`}
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
                    <CopyLinkAction nodeId={page.id} item={DropdownMenuItem} />
                    <DropdownMenuItem
                      disabled={isDuplicating}
                      onSelect={() => handleDuplicate()}
                    >
                      <Copy className="size-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                      <FolderInput className="size-4" />
                      Move to
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
                      <ArrowRightLeft className="size-4" />
                      Transfer to another workspace…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => handleCreateSubpage()}>
            <Plus className="size-4" />
            Create subpage
          </ContextMenuItem>
          <ContextMenuItem onClick={() => startRenaming()}>
            <Pencil className="size-4" />
            Rename
          </ContextMenuItem>
          <CopyLinkAction nodeId={page.id} item={ContextMenuItem} />
          <ContextMenuItem
            disabled={isDuplicating}
            onClick={() => handleDuplicate()}
          >
            <Copy className="size-4" />
            Duplicate
          </ContextMenuItem>
          {/* Dragging needs a mouse — this is the same move, reachable by touch. */}
          <ContextMenuItem onClick={() => setMoveOpen(true)}>
            <FolderInput className="size-4" />
            Move to
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setTransferOpen(true)}>
            <ArrowRightLeft className="size-4" />
            Transfer to another workspace…
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {hasChildren && (
        <CollapsibleContent>
          <ul className="ml-3 flex min-w-0 flex-col gap-0.5 py-0.5">
            {children.map((child) => (
              <li key={child.id}>
                <SidebarItem node={child} />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      )}
      {moveOpen && (
        <PageMoveDialog page={page} open={moveOpen} onOpenChange={setMoveOpen} />
      )}
      {transferOpen && (
        <PageTransferDialog
          page={page}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      )}
    </Collapsible>
  );
};
