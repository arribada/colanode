import { coalesce, eq, inArray, useLiveQuery } from '@tanstack/react-db';
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
  Compass,
  ListTodo,
  MessagesSquare,
  Satellite,
  Search,
  Ticket,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
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
import { ADR_DATABASE_ID } from '@colanode/ui/lib/adr';

// Node types shown in the "Recently updated" feed. Pulled via a dedicated
// bounded query (ordered by recency, capped at RECENT_LIMIT) so the home
// screen never materialises every page/record just to show a few rows.
const RECENT_TYPES = ['page', 'database', 'record', 'folder', 'whiteboard'];

// How many rows the "Recently updated" feed shows.
const RECENT_LIMIT = 8;

// Structural nodes the dashboard needs in full: spaces (the Spaces grid) and
// databases (to locate the "Wiki Tasks" registry by name). Both sets are tiny.
const STRUCTURAL_TYPES = ['space', 'database'];

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

  const notificationsQuery = useClientQuery({
    type: 'notification.list',
    userId: workspace.userId,
  });

  const planeIssuesQuery = useClientQuery(
    {
      type: 'plane.my.issues',
      userId: workspace.userId,
    },
    // Plane lives behind a server proxy with no local subscription; don't
    // retry (a disabled integration 400s) so the section just hides itself.
    { retry: false }
  );

  const planeData = planeIssuesQuery.data;
  const planeIssues = planeData?.issues ?? [];
  const planeTotal = planeData?.total ?? 0;

  const notifications = notificationsQuery.data ?? [];

  // Resolve the notification/task source nodes by id, rather than scanning
  // every page/record in the workspace. The joined key keeps the live query's
  // dependency stable across renders.
  const sourceNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notifications) {
      ids.add(n.source_node_id);
    }
    return [...ids];
  }, [notifications]);

  // Structural nodes (spaces + databases): small, and it drives the Spaces grid
  // plus the Wiki-Tasks registry lookup.
  const structuralQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.type, STRUCTURAL_TYPES)),
    [workspace.userId]
  );

  // "Recently updated" — bounded at the source: ordered by recency (updatedAt,
  // falling back to createdAt) and capped, so the home never pulls the whole
  // wiki to show RECENT_LIMIT rows.
  const recentQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.type, RECENT_TYPES))
        .orderBy(
          ({ nodes }) => coalesce(nodes.updatedAt, nodes.createdAt),
          'desc'
        )
        .limit(RECENT_LIMIT),
    [workspace.userId]
  );

  // The notification/task rows' source nodes, fetched by id.
  const sourceQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.id, sourceNodeIds)),
    [sourceNodeIds.join(',')]
  );

  const structuralNodes = useMemo(
    () => structuralQuery.data ?? [],
    [structuralQuery.data]
  );

  const spaces = useMemo(
    () => structuralNodes.filter((node) => node.type === 'space'),
    [structuralNodes]
  );

  // Resolve the shared "Wiki Tasks" registry by name rather than a hardcoded
  // id, so the link survives the registry being recreated (a new node gets a
  // fresh id but keeps the "Wiki Tasks" name).
  const tasksRegistry = useMemo(
    () =>
      structuralNodes.find(
        (node) =>
          node.type === 'database' &&
          'name' in node &&
          typeof node.name === 'string' &&
          node.name.toLowerCase().includes('wiki tasks')
      ),
    [structuralNodes]
  );

  // The current user's account, to match against the Wiki Tasks "leader"
  // option — which stores full names like "Geoffrey Fournier" while the account
  // name is usually a first name like "Geoffrey".
  const currentUserQuery = useLiveQuery(
    (q) =>
      q
        .from({ users: workspace.collections.users })
        .where(({ users }) => eq(users.id, workspace.userId))
        .findOne(),
    [workspace.userId]
  );
  const currentUser = currentUserQuery.data as
    | { name?: string | null; email?: string | null }
    | undefined;

  // Every record in the Wiki Tasks registry. We derive "your wiki tasks" from
  // the database directly (leader field -> current user) instead of the
  // automation notifications, which are only ever created locally for whoever
  // edits a task — so a cron-driven leader reassignment notifies no one.
  const wikiTasksQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'record'))
        .where(({ nodes }) =>
          eq(
            (nodes as unknown as LocalRecordNode).databaseId,
            tasksRegistry?.id ?? '__none__'
          )
        ),
    [tasksRegistry?.id ?? '']
  );

  const myWikiTasks = useMemo<LocalRecordNode[]>(() => {
    if (!tasksRegistry || tasksRegistry.type !== 'database' || !currentUser) {
      return [];
    }
    const db = tasksRegistry as LocalDatabaseNode;
    const leaderField = Object.values(db.fields ?? {}).find(
      (f) =>
        f.type === 'select' &&
        (f.name.toLowerCase().includes('lead') ||
          f.name.toLowerCase().includes('owner') ||
          f.name.toLowerCase().includes('responsa'))
    );
    if (!leaderField || leaderField.type !== 'select') {
      return [];
    }
    const options = leaderField.options ?? {};

    const name = (currentUser.name ?? '').trim().toLowerCase();
    const emailLocal = (currentUser.email ?? '').split('@')[0]?.toLowerCase() ?? '';
    if (!name && !emailLocal) {
      return [];
    }
    const matchesLeader = (leaderName: string) => {
      const words = leaderName.toLowerCase().split(/\s+/).filter(Boolean);
      return (
        (name.length > 0 && words.includes(name)) ||
        (emailLocal.length > 0 && words.includes(emailLocal))
      );
    };

    const records = (wikiTasksQuery.data ?? []) as LocalRecordNode[];
    return records
      .filter((record) => record.isTemplate !== true)
      .filter((record) => {
        const value = record.fields?.[leaderField.id];
        const optionId =
          value && typeof value === 'object' && 'value' in value
            ? (value.value as string | undefined)
            : undefined;
        if (!optionId) {
          return false;
        }
        const option = options[optionId];
        return option ? matchesLeader(option.name) : false;
      })
      .slice(0, 8);
  }, [tasksRegistry, currentUser, wikiTasksQuery.data]);

  // ADR registry records, to surface UNRESOLVED architecture decisions on the
  // home for traceability (mirror of "Your wiki tasks").
  const adrDbQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, ADR_DATABASE_ID))
        .findOne(),
    [workspace.userId]
  );
  const adrRecordsQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'record'))
        .where(({ nodes }) =>
          eq((nodes as unknown as LocalRecordNode).databaseId, ADR_DATABASE_ID)
        ),
    [workspace.userId]
  );
  const unresolvedAdrs = useMemo<LocalRecordNode[]>(() => {
    const db = adrDbQuery.data as LocalDatabaseNode | undefined;
    const records = (adrRecordsQuery.data ?? []) as LocalRecordNode[];
    const statusField =
      db && db.type === 'database'
        ? Object.values(db.fields ?? {}).find(
            (f) =>
              f.type === 'select' && f.name.toLowerCase().includes('status')
          )
        : undefined;
    const options =
      statusField && statusField.type === 'select'
        ? (statusField.options ?? {})
        : {};
    return records
      .filter((record) => record.isTemplate !== true)
      .filter((record) => {
        if (!statusField) {
          return true;
        }
        const value = record.fields?.[statusField.id];
        const optionId =
          value && typeof value === 'object' && 'value' in value
            ? (value.value as string | undefined)
            : undefined;
        const optionName = optionId
          ? (options[optionId]?.name ?? '').toLowerCase()
          : '';
        return !/resolv|closed|done/.test(optionName);
      })
      .slice(0, 8);
  }, [adrDbQuery.data, adrRecordsQuery.data]);

  const recent = recentQuery.data ?? [];

  const nodeById = useMemo(
    () => new Map((sourceQuery.data ?? []).map((node) => [node.id, node])),
    [sourceQuery.data]
  );
  // Task assignments (from the wiki-task automations) go in "Your wiki tasks";
  // everything else (mentions, replies) goes in "Notifications". Kept disjoint
  // so the two sections never show the same row twice.
  const otherNotifications = notifications
    .filter((n) => n.type !== 'automation')
    .slice(0, 6);

  const firstSpaceId = spaces[0]?.id;

  // Destination options for the home "New page" dialog's space picker; names
  // come from the same display resolver the Spaces grid uses.
  const spaceOptions = useMemo(
    () =>
      spaces.map((space) => ({
        id: space.id,
        name: getMentionNodeDisplay(space).name,
      })),
    [spaces]
  );

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
            No recent notifications.
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
        {myWikiTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks assigned to you right now. When a task in the Wiki Tasks
            registry has you as its leader, it shows up here.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {myWikiTasks.map((record) => {
              const { name, avatar } = getMentionNodeDisplay(record);
              return (
                <Link
                  key={record.id}
                  from="/workspace/$userId"
                  to="$nodeId"
                  params={{ nodeId: record.id }}
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                >
                  <Avatar
                    size="small"
                    id={record.id}
                    name={name}
                    avatar={avatar}
                  />
                  <span className="flex-1 truncate text-sm">{name}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Unresolved ADRs — architecture decisions still open / in reflection. */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Compass className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">ADRs to resolve</h2>
          {adrDbQuery.data ? (
            <Link
              from="/workspace/$userId"
              to="$nodeId"
              params={{ nodeId: ADR_DATABASE_ID }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Open the ADR registry →
            </Link>
          ) : null}
        </div>
        {unresolvedAdrs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No unresolved ADRs. Decisions still open or in reflection show up
            here.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {unresolvedAdrs.map((record) => {
              const { name, avatar } = getMentionNodeDisplay(record);
              return (
                <Link
                  key={record.id}
                  from="/workspace/$userId"
                  to="$nodeId"
                  params={{ nodeId: record.id }}
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                >
                  <Avatar
                    size="small"
                    id={record.id}
                    name={name}
                    avatar={avatar}
                  />
                  <span className="flex-1 truncate text-sm">{name}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* My Plane tickets — the current user's assigned Plane issues, pulled
          live through the server-side Plane proxy. Rendered as nothing if the
          integration is disabled or the fetch errors, so the home never breaks. */}
      {planeIssuesQuery.isPending || planeIssuesQuery.isError ? null : (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">My Plane tickets</h2>
            <a
              href="https://plane.arribada.org"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Open Plane →
            </a>
          </div>
          {planeIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Plane tickets assigned to you.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {planeIssues.map((issue) => (
                <a
                  key={`${issue.key}:${issue.url}`}
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                >
                  <span className="w-28 shrink-0 truncate text-xs font-medium text-muted-foreground">
                    {issue.key}
                  </span>
                  <span className="flex-1 truncate text-sm">{issue.name}</span>
                  <span className="hidden max-w-[8rem] shrink-0 truncate text-xs text-muted-foreground sm:inline">
                    {issue.projectName}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs capitalize text-muted-foreground">
                    {issue.stateGroup}
                  </span>
                </a>
              ))}
            </div>
          )}
          {planeTotal > planeIssues.length ? (
            <p className="text-xs text-muted-foreground">
              Showing {planeIssues.length} of {planeTotal}
            </p>
          ) : null}
        </section>
      )}

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
          spaces={spaceOptions}
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
