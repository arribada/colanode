import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRightLeft,
  ChevronRight,
  Copy,
  FolderInput,
  Pencil,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
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
import { Link } from '@colanode/ui/components/ui/link';
import {
  InlineRenameField,
  useInlineRename,
} from '@colanode/ui/components/layouts/sidebars/sidebar-inline-rename';
import { SidebarDropIndicator } from '@colanode/ui/components/layouts/sidebars/sidebar-drop-indicator';
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

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/page-item w-full"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            from="/workspace/$userId"
            to="$nodeId"
            params={{ nodeId: page.id }}
            data-testid={`page-item-${page.id}`}
            activeProps={{ 'aria-current': 'page' }}
            // The row itself is the drag source; without this the browser would
            // rather drag the link.
            draggable={false}
          >
            {({ isActive }) => (
              <div
                ref={ref}
                className={cn(
                  'group/page-row relative text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
                  isActive &&
                    'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                  isDragging && 'opacity-50',
                  isDropInside && 'bg-sidebar-accent ring-1 ring-sidebar-ring'
                )}
              >
                <SidebarDropIndicator edge={dropEdge} />
                {hasChildren ? (
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      aria-label={
                        open ? 'Collapse subpages' : 'Expand subpages'
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen(!open);
                      }}
                      className="flex items-center cursor-pointer rounded-sm hover:bg-sidebar-border"
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
                  <span
                    className="line-clamp-1 w-full grow text-left"
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startRenaming();
                    }}
                  >
                    {page.name ?? 'Unnamed'}
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
          <ContextMenuItem
            disabled={isDuplicating}
            onClick={() => {
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
            }}
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
        <PageMoveDialog
          page={page}
          open={moveOpen}
          onOpenChange={setMoveOpen}
        />
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
