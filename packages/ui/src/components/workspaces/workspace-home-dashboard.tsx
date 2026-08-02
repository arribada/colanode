import { inArray, useLiveQuery } from '@tanstack/react-db';
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  FolderKanban,
  Github,
  History,
  LayoutGrid,
  ListTodo,
  MessagesSquare,
  Satellite,
} from 'lucide-react';
import { useMemo } from 'react';

import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
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

// The shared "🔴 Wiki Tasks" registry node in the Arribada workspace.
const WIKI_TASKS_REGISTRY_ID = '01kypqr1dc2dw5wbydtfave3emdb';

// Turn a notification's stored preview into a human label. Automation
// notifications (task assignments from the wiki-task automations) carry their
// message in preview.message; others fall back to a resolved node name.
const getNotificationMessage = (
  type: string,
  preview: string,
  fallback: string
): string => {
  if (type === 'automation') {
    try {
      const parsed = JSON.parse(preview) as { message?: string };
      if (parsed.message) {
        return parsed.message;
      }
    } catch {
      // ignore malformed preview
    }
  }
  return fallback;
};

export const WorkspaceHomeDashboard = () => {
  const workspace = useWorkspace();

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

  const tasksRegistry = nodeById.get(WIKI_TASKS_REGISTRY_ID);

  const markRead = (notificationId: string) => {
    window.colanode.executeMutation({
      type: 'notification.read',
      userId: workspace.userId,
      notificationId,
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
            {otherNotifications.map((n) => {
              const source = nodeById.get(n.source_node_id);
              const display = source ? getMentionNodeDisplay(source) : null;
              const label = getNotificationMessage(
                n.type,
                n.preview,
                display?.name ?? n.type
              );
              const unread = !n.read_at;
              const row = (
                <>
                  <Avatar
                    size="small"
                    id={n.source_node_id}
                    name={display?.name ?? label}
                    avatar={display?.avatar}
                  />
                  <span
                    className={`flex-1 truncate text-sm ${
                      unread ? 'font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </span>
                  {unread ? (
                    <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                  ) : null}
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {timeAgo(n.created_at)}
                  </span>
                </>
              );
              return source ? (
                <Link
                  key={n.id}
                  from="/workspace/$userId"
                  to="$nodeId"
                  params={{ nodeId: source.id }}
                  onClick={() => markRead(n.id)}
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                >
                  {row}
                </Link>
              ) : (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent"
                >
                  {row}
                </button>
              );
            })}
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
            {taskNotifications.map((n) => {
              const source = nodeById.get(n.source_node_id);
              const label = getNotificationMessage(n.type, n.preview, 'Task');
              const unread = !n.read_at;
              const row = (
                <>
                  {unread ? (
                    <ListTodo className="size-4 shrink-0 text-blue-500" />
                  ) : (
                    <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={`flex-1 truncate text-sm ${
                      unread ? 'font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {timeAgo(n.created_at)}
                  </span>
                </>
              );
              return source ? (
                <Link
                  key={n.id}
                  from="/workspace/$userId"
                  to="$nodeId"
                  params={{ nodeId: source.id }}
                  onClick={() => markRead(n.id)}
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                >
                  {row}
                </Link>
              ) : (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent"
                >
                  {row}
                </button>
              );
            })}
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
    </div>
  );
};
