import { eq, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';

import { collections } from '@colanode/ui/collections';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { ArribadaMark } from '@colanode/ui/components/ui/arribada-logo';
import { cn } from '@colanode/ui/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { UnreadBadge } from '@colanode/ui/components/ui/unread-badge';
import { useRadar } from '@colanode/ui/contexts/radar';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

// The shared Arribada workspace shows the brand mark instead of a generated letter
// avatar; a private workspace keeps its default avatar. A custom uploaded avatar wins.
const WorkspaceAvatar = ({
  id,
  name,
  avatar,
  className,
}: {
  id: string;
  name: string;
  avatar?: string | null;
  className?: string;
}) => {
  if ((!avatar || avatar === '') && name.trim().toLowerCase().startsWith('arribada')) {
    return (
      <div className={cn('flex items-center justify-center bg-white', className)}>
        <ArribadaMark className="h-3/5 w-3/5 text-[#0a1929]" />
      </div>
    );
  }
  return <Avatar id={id} name={name} avatar={avatar ?? undefined} className={className} />;
};

export const SidebarMenuHeader = () => {
  const workspace = useWorkspace();
  const radar = useRadar();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);

  const workspacesQuery = useLiveQuery(
    (q) =>
      q
        .from({ workspaces: collections.workspaces })
        .where(({ workspaces }) =>
          eq(workspaces.accountId, workspace.accountId)
        ),
    [workspace.accountId]
  );

  const workspaces = workspacesQuery.data;
  const currentWorkspace = workspaces.find(
    (w) => w.userId === workspace.userId
  );
  const otherWorkspaces = workspaces.filter(
    (w) => w.userId !== workspace.userId
  );
  const otherWorkspaceStates = otherWorkspaces.map((w) =>
    radar.getWorkspaceState(w.userId)
  );
  const unreadCount = otherWorkspaceStates.reduce(
    (acc, curr) => acc + curr.state.unreadCount,
    0
  );
  const hasUnread = otherWorkspaceStates.some((w) => w.state.hasUnread);

  if (!currentWorkspace) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Workspaces menu"
          className="flex w-full items-center justify-center relative cursor-pointer outline-none mt-2"
        >
          <WorkspaceAvatar
            id={currentWorkspace.workspaceId}
            avatar={currentWorkspace.avatar}
            name={currentWorkspace.name}
            className="size-10 rounded-lg shadow-md"
          />
          <UnreadBadge
            count={unreadCount}
            unread={hasUnread}
            className="absolute -top-1 right-0"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-80 rounded-lg"
        align="start"
        side="right"
        sideOffset={4}
      >
        <DropdownMenuLabel className="mb-1">Workspaces</DropdownMenuLabel>
        {workspaces.map((workspaceItem) => {
          const workspaceUnreadState = radar.getWorkspaceState(
            workspaceItem.userId
          );
          return (
            <DropdownMenuItem
              key={workspaceItem.userId}
              data-testid={`sidebar-workspace-item-${workspaceItem.userId}`}
              aria-current={
                workspaceItem.userId === workspace.userId ? 'true' : undefined
              }
              className="p-0 cursor-pointer"
              onClick={() => {
                navigate({
                  to: '/workspace/$userId',
                  params: {
                    userId: workspaceItem.userId,
                  },
                });
              }}
            >
              <div className="w-full flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <WorkspaceAvatar
                  className="h-8 w-8 rounded-lg"
                  id={workspaceItem.workspaceId}
                  name={workspaceItem.name}
                  avatar={workspaceItem.avatar}
                />
                <p className="flex-1 text-left text-sm leading-tight truncate font-normal">
                  {workspaceItem.name}
                </p>
                {workspaceItem.userId === workspace.userId ? (
                  <Check className="size-4" />
                ) : (
                  <UnreadBadge
                    count={workspaceUnreadState.state.unreadCount}
                    unread={workspaceUnreadState.state.hasUnread}
                  />
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          data-testid="sidebar-workspace-create"
          className="gap-2 p-2 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => {
            navigate({
              to: '/create',
            });
          }}
        >
          <Plus className="size-4" />
          <p className="font-medium">Create workspace</p>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
