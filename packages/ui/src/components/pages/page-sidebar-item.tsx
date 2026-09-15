import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRightLeft,
  ChevronRight,
  Columns2,
  Copy,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
  Rows2,
  Smile,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { LocalNode, LocalPageNode } from '@colanode/client/types';
import { extractNodeRole, generateId, hasNodeRole, IdType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarDropIndicator } from '@colanode/ui/components/layouts/sidebars/sidebar-drop-indicator';
import {
  InlineRenameField,
  useInlineRename,
} from '@colanode/ui/components/layouts/sidebars/sidebar-inline-rename';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import { PageMoveDialog } from '@colanode/ui/components/pages/page-move-dialog';
import {
  PageTemplateSubmenu,
  useCreatePageFromTemplate,
} from '@colanode/ui/components/pages/page-template-submenu';
import { PageTransferDialog } from '@colanode/ui/components/pages/page-transfer-dialog';
import { PageUpdateDialog } from '@colanode/ui/components/pages/page-update-dialog';
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
import { useSplitView } from '@colanode/ui/contexts/split-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import { cn } from '@colanode/ui/lib/utils';

interface PageSidebarItemProps {
  page: LocalPageNode;
}

// What a page shows underneath it — including whiteboards, so a whiteboard moved
// into a page nests under it in the sidebar tree, matching the in-body subpage
// list. Files live in folders and are opened from the folder view, so they never
// make it into the tree.
const PAGE_CHILD_TYPES = ['page', 'database', 'folder', 'whiteboard'];

// A leading emoji typed into a page name (e.g. "🎯 Mission Tracker") predates
// real page icons. splitLeadingEmoji peels it off so the row can show it AS the
// icon and drop it from the displayed name — matching a page whose icon was set
// from the menu. Handles a single pictographic plus skin-tone / variation-
// selector / ZWJ sequences. Display only: the stored name is never changed.
const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:(?:[\u{1F3FB}-\u{1F3FF}\uFE0F]|\u200D)\p{Extended_Pictographic}?)*)\s*/u;

const splitLeadingEmoji = (
  name: string
): { emoji: string | null; rest: string } => {
  const match = name.match(LEADING_EMOJI);
  if (!match || !match[1]) {
    return { emoji: null, rest: name };
  }
  return { emoji: match[1], rest: name.slice(match[0].length) };
};

export const PageSidebarItem = ({ page }: PageSidebarItemProps) => {
  const workspace = useWorkspace();
  const tree = useSidebarTree();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const splitView = useSplitView();
  const { mutate: duplicatePage, isPending: isDuplicating } = useMutation();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
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

  // Promote a leading name emoji to the icon slot, but only when a real name
  // remains after it and no explicit avatar is set (an avatar always wins).
  const { emoji: rawLeadingEmoji, rest: nameAfterEmoji } = splitLeadingEmoji(
    page.name ?? ''
  );
  const nameEmoji =
    !page.avatar && rawLeadingEmoji && nameAfterEmoji.trim().length > 0
      ? rawLeadingEmoji
      : null;
  const displayName =
    (nameEmoji ? nameAfterEmoji.trim() : page.name) || 'Unnamed';

  // The row icon: the promoted emoji (rendered as the same native glyph it
  // already was in the name) or the page's Avatar. `className` carries the
  // per-branch sizing / hover behaviour.
  const renderPageIcon = (className: string) =>
    nameEmoji ? (
      <span
        aria-hidden
        className={cn('flex items-center justify-center leading-none', className)}
        style={{ fontSize: 13 }}
      >
        {nameEmoji}
      </span>
    ) : (
      <Avatar
        id={page.id}
        avatar={page.avatar}
        name={page.name}
        className={className}
      />
    );

  // Resolve this page's effective role from the full ancestor chain
  // (root -> page), the way NodeProvider does, so gates honor node-level
  // collaborators and not just the space grant. Drives both the Delete gate and
  // the "Change icon" action (each needs editor).
  const role = useMemo(() => {
    const chain: LocalNode[] = [];
    let current: LocalNode | undefined = page;
    while (current) {
      chain.unshift(current);
      current = current.parentId ? tree.nodeById(current.parentId) : undefined;
    }
    return extractNodeRole(chain, workspace.userId);
  }, [page, tree, workspace.userId]);
  const canEdit = role ? hasNodeRole(role, 'editor') : false;
  const canDelete = canEdit;

  // "New from template" files the template's page tree last under this page
  // and opens it; the row expands so the new child is visible in the tree.
  const createFromTemplate = useCreatePageFromTemplate({
    spaceId: page.rootId,
    parentId: page.id,
    onCreated: () => setOpen(true),
  });

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
                  {renderPageIcon(
                    'group-hover/page-row:hidden size-4 shrink-0'
                  )}
                  <ChevronRight className="hidden transition-transform group-hover/page-row:block group-data-[state=open]/page-item:rotate-90 size-4 shrink-0" />
                </button>
              </CollapsibleTrigger>
            ) : (
              renderPageIcon('size-4 shrink-0')
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
                  className="truncate block w-full text-left"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startRenaming();
                  }}
                >
                  {displayName}
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
                    {canEdit && (
                      <DropdownMenuItem
                        onSelect={() => setShowUpdateDialog(true)}
                      >
                        <Smile className="size-4" />
                        Change icon
                      </DropdownMenuItem>
                    )}
                    <CopyLinkAction nodeId={page.id} item={DropdownMenuItem} />
                    <DropdownMenuItem
                      disabled={isDuplicating}
                      onSelect={() => handleDuplicate()}
                    >
                      <Copy className="size-4" />
                      Duplicate
                    </DropdownMenuItem>
                    {canEdit && (
                      <PageTemplateSubmenu
                        spaceId={page.rootId}
                        onSelect={createFromTemplate}
                      />
                    )}
                    <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                      <FolderInput className="size-4" />
                      Move to
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
                      <ArrowRightLeft className="size-4" />
                      Transfer to another workspace…
                    </DropdownMenuItem>
                    {canDelete && (
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
          <ContextMenuItem onClick={() => handleCreateSubpage()}>
            <Plus className="size-4" />
            Create subpage
          </ContextMenuItem>
          <ContextMenuItem onClick={() => startRenaming()}>
            <Pencil className="size-4" />
            Rename
          </ContextMenuItem>
          {canEdit && (
            <ContextMenuItem onClick={() => setShowUpdateDialog(true)}>
              <Smile className="size-4" />
              Change icon
            </ContextMenuItem>
          )}
          <CopyLinkAction nodeId={page.id} item={ContextMenuItem} />
          <ContextMenuItem
            disabled={isDuplicating}
            onClick={() => handleDuplicate()}
          >
            <Copy className="size-4" />
            Duplicate
          </ContextMenuItem>
          {splitView.isSplitAvailable && (
            <>
              <ContextMenuItem
                onClick={() =>
                  splitView.openInSplit(
                    `/workspace/${workspace.userId}/${page.id}`,
                    'horizontal'
                  )
                }
              >
                <Columns2 className="size-4" />
                Open in split (right)
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() =>
                  splitView.openInSplit(
                    `/workspace/${workspace.userId}/${page.id}`,
                    'vertical'
                  )
                }
              >
                <Rows2 className="size-4" />
                Open in split (down)
              </ContextMenuItem>
            </>
          )}
          {/* Dragging needs a mouse — this is the same move, reachable by touch. */}
          <ContextMenuItem onClick={() => setMoveOpen(true)}>
            <FolderInput className="size-4" />
            Move to
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setTransferOpen(true)}>
            <ArrowRightLeft className="size-4" />
            Transfer to another workspace…
          </ContextMenuItem>
          {canDelete && (
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
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
      {role && (
        <PageUpdateDialog
          page={page}
          role={role}
          open={showUpdateDialog}
          onOpenChange={setShowUpdateDialog}
        />
      )}
      <NodeDeleteDialog
        id={page.id}
        title="Are you sure you want delete this page?"
        description="This action cannot be undone. This page will no longer be accessible by you or others you've shared it with."
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      />
    </Collapsible>
  );
};
