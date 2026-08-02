import { inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Bell,
  FilePlus2,
  FolderKanban,
  FolderPlus,
  Github,
  History,
  LayoutGrid,
  ListTodo,
  MessagesSquare,
  Satellite,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { NotificationItem } from '@colanode/ui/components/notifications/notification-item';
import { PageCreateDialog } from '@colanode/ui/components/pages/page-create-dialog';
import { SpaceCreateDialog } from '@colanode/ui/components/spaces/space-create-dialog';
import { Link } from '@colanode/ui/components/ui/link';
import { useSearch } from '@colanode/ui/contexts/search';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery as useClientQuery } from '@colanode/ui/hooks/use-live-query';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

// Node types shown in the "Recently updated" feed.
const RECENT_TYPES = new Set<string>([
  'page',
  'database',
  'record',
  'folder',
  'whiteboard',
]);

// The node types the dashboard actually reads: the "Recently updated" feed
// (RECENT_TYPES), the Spaces grid ('space'), and the notification/task name
// lookups (whose source nodes are pages/records/etc., all in RECENT_TYPES). The
// query filters to these so the home screen never materialises the whole wiki.
const HOME_NODE_TYPES = [...RECENT_TYPES, 'space'];

// Live/healthy Arribada apps. Chat = Mattermost (chat.arribada.org): the
// production chat is Mattermost; the droplet's Zulip is only an eval instance.
const TOOLS = [
  {
    name: 'Plane',
    description: 'Projects, tasks & news',
    href: 'https://plane.arribada.org',
    icon: FolderKanban,
  },
  {
    name: 'Devices',
    description: 'Dashboard & tracking',
    href: 'https://devices.arribada.org',
    icon: Satellite,
  },
  {
    name: 'Chat',
    description: 'Team messaging',
    href: 'https://chat.arribada.org',
    icon: MessagesSquare,
  },
  {
    name: 'GitHub',
    description: 'Code & firmware',
    href: 'https://github.com/arribada',
    icon: Github,
  },
];

export const WorkspaceHomeDashboard = () => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const search = useSearch();

  const [pageDialogOpen, setPageDialogOpen] = useState(false);
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false);

  const nodeListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.type, HOME_NODE_TYPES)),
    [workspace.userId]
  );

  const notificationsQuery = useClientQuery({
    type: 'notification.list',
    userId: workspace.userId,
  });

  const allNodes = useMemo(
    () => nodeListQuery.data ?? [],
    [nodeListQuery.data]
  );

  const nodeById = useMemo(
    () => new Map(allNodes.map((node) => [node.id, node])),
    [allNodes]
  );

  const spaces = useMemo(
    () => allNodes.filter((node) => node.type === 'space'),
    [allNodes]
  );

  const recent = useMemo(
    () =>
      [...allNodes]
        .filter((node) => RECENT_TYPES.has(node.type))
        .sort((a, b) =>
          (b.updatedAt ?? b.createdAt).localeCompare(
            a.updatedAt ?? a.createdAt
          )
        )
        .slice(0, 8),
    [allNodes]
  );

  // Resolve the shared "Wiki Tasks" registry by name rather than a hardcoded
  // id, so the link survives the registry being recreated (a new node gets a
  // fresh id but keeps the "Wiki Tasks" name).
  const tasksRegistry = useMemo(
    () =>
      allNodes.find(
        (node) =>
          node.type === 'database' &&
          'name' in node &&
          typeof node.name === 'string' &&
          node.name.toLowerCase().includes('wiki tasks')
      ),
    [allNodes]
  );

  const notifications = notificationsQuery.data ?? [];
  // Task assignments (from the wiki-task automations) go in "Your wiki tasks";
  // everything else (mentions, replies) goes in "Notifications". Kept disjoint
  // so the two sections never show the same row twice.
  const taskNotifications = notifications
    .filter((n) => n.type === 'automation')
    .slice(0, 6);
  const otherNotifications = notifications
    .filter((n) => n.type !== 'automation')
    .slice(0, 6);

  const firstSpaceId = spaces[0]?.id;

  const handleNavigate = (nodeId: string) => {
    navigate({
      to: '/workspace/$userId/$nodeId',
      params: { userId: workspace.userId, nodeId },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-16 pt-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to the Arribada Wiki
        </h1>
        <p className="text-sm text-muted-foreground">
          Your spaces, the latest updates and the rest of the Arribada tools —
          all in one place.
        </p>
      </div>

      {/* Quick actions — create a page/space or jump into workspace search. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="home-new-page"
          onClick={() => setPageDialogOpen(true)}
          disabled={!firstSpaceId}
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium transition-all hover:border-border hover:bg-accent hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
        >
          <FilePlus2 className="size-4 text-muted-foreground" />
          New page
        </button>
        <button
          type="button"
          data-testid="home-new-space"
          onClick={() => setSpaceDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium transition-all hover:border-border hover:bg-accent hover:shadow-sm"
        >
          <FolderPlus className="size-4 text-muted-foreground" />
          New space
        </button>
        <button
          type="button"
          data-testid="home-search"
          onClick={() => search.setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-border hover:bg-accent hover:shadow-sm"
        >
          <Search className="size-4" />
          Search
        </button>
      </div>

      {/* Notifications — mentions, replies and comments aimed at you. */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Notifications</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          You're notified when someone mentions you, replies in a thread you're
          part of, or comments on a page you own. Assigned wiki tasks appear in
          "Your wiki tasks" below.
        </p>
        {otherNotifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You're all caught up — no new notifications.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {otherNotifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                node={nodeById.get(n.source_node_id)}
                userId={workspace.userId}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}
      </section>

      {/* Your wiki tasks — assignments raised by the wiki-task automations. */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ListTodo className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Your wiki tasks</h2>
          {tasksRegistry ? (
            <Link
              from="/workspace/$userId"
              to="$nodeId"
              params={{ nodeId: tasksRegistry.id }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Open the Wiki Tasks registry →
            </Link>
          ) : null}
        </div>
        {taskNotifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks assigned to you right now. When a task in the Wiki Tasks
            registry is assigned to you, it shows up here.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {taskNotifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                node={nodeById.get(n.source_node_id)}
                userId={workspace.userId}
                variant="task"
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Spaces</h2>
        </div>
        {spaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spaces yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space) => {
              const { name, avatar } = getMentionNodeDisplay(space);
              const description =
                'description' in space &&
                typeof space.description === 'string' &&
                space.description.length > 0
                  ? space.description
                  : null;
              return (
                <Link
                  key={space.id}
                  from="/workspace/$userId"
                  to="$nodeId"
                  params={{ nodeId: space.id }}
                  className="group flex flex-col gap-2 rounded-lg border border-border/60 bg-background p-4 transition-all hover:border-border hover:bg-accent hover:shadow-md"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      size="small"
                      id={space.id}
                      name={name}
                      avatar={avatar}
                      className="shrink-0"
                    />
                    <span className="truncate text-sm font-medium">{name}</span>
                  </div>
                  {description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Recently updated</h2>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recent yet.</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {recent.map((node) => {
              const { name, avatar, label } = getMentionNodeDisplay(node);
              return (
                <Link
                  key={node.id}
                  from="/workspace/$userId"
                  to="$nodeId"
                  params={{ nodeId: node.id }}
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                >
                  <Avatar
                    size="small"
                    id={node.id}
                    name={name}
                    avatar={avatar}
                  />
                  <span className="flex-1 truncate text-sm">{name}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {label}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {timeAgo(node.updatedAt ?? node.createdAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Tools</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <a
                key={tool.name}
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-row items-center gap-3 rounded-lg border border-border/60 bg-background p-4 transition-all hover:border-border hover:bg-accent hover:shadow-md"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tool.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tool.description}
                  </p>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            );
          })}
        </div>
      </section>

      {firstSpaceId ? (
        <PageCreateDialog
          spaceId={firstSpaceId}
          open={pageDialogOpen}
          onOpenChange={setPageDialogOpen}
        />
      ) : null}
      <SpaceCreateDialog
        open={spaceDialogOpen}
        onOpenChange={setSpaceDialogOpen}
      />
    </div>
  );
};
