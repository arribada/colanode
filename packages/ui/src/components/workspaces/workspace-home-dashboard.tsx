import { useLiveQuery } from '@tanstack/react-db';
import {
  ArrowUpRight,
  FolderKanban,
  Github,
  History,
  LayoutGrid,
  MessagesSquare,
  Satellite,
} from 'lucide-react';

import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

// Node types shown in the "Recently updated" feed.
const RECENT_TYPES = new Set<string>([
  'page',
  'database',
  'record',
  'folder',
  'whiteboard',
]);

// Live/healthy Arribada apps. Chat = Mattermost (chat.arribada.org): the
// production chat is Mattermost; the droplet's Zulip is only an eval instance.
const TOOLS = [
  {
    name: 'Plane',
    description: 'Projets, tâches & news',
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
    description: "Messagerie de l'équipe",
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

  const nodeListQuery = useLiveQuery(
    (q) => q.from({ nodes: workspace.collections.nodes }),
    [workspace.userId]
  );

  const allNodes = nodeListQuery.data ?? [];

  const spaces = allNodes.filter((node) => node.type === 'space');

  const recent = [...allNodes]
    .filter((node) => RECENT_TYPES.has(node.type))
    .sort((a, b) =>
      (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
    )
    .slice(0, 8);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-16 pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bienvenue sur Arribada Wiki
        </h1>
        <p className="text-sm text-muted-foreground">
          Vos espaces, les dernières mises à jour et le reste des outils
          Arribada — au même endroit.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Espaces</h2>
        </div>
        {spaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun espace pour le moment.
          </p>
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
          <h2 className="text-sm font-medium">Mises à jour récentes</h2>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien de récent.</p>
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
          <h2 className="text-sm font-medium">Outils</h2>
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
