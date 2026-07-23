import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalNode, LocalPageNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
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
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { cn } from '@colanode/ui/lib/utils';

interface PageSidebarItemProps {
  page: LocalPageNode;
}

export const PageSidebarItem = ({ page }: PageSidebarItemProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { mutate: duplicatePage, isPending: isDuplicating } = useMutation();
  const [open, setOpen] = useState(false);

  const childrenQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.parentId, page.id))
        .where(({ nodes }) =>
          inArray(nodes.type, ['page', 'database', 'folder'])
        )
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    [workspace.userId, page.id]
  );

  const children = (childrenQuery.data ?? []) as LocalNode[];
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
          >
            {({ isActive }) => (
              <div
                className={cn(
                  'group/page-row text-sm flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
                  isActive &&
                    'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                )}
              >
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
                <span className="line-clamp-1 w-full grow text-left">
                  {page.name ?? 'Unnamed'}
                </span>
              </div>
            )}
          </Link>
        </ContextMenuTrigger>
        <ContextMenuContent>
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
    </Collapsible>
  );
};
