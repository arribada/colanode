// ABOUTME: One combined presence + "viewed by" pastille for a page/record — live
// ABOUTME: presence (online now, green dot) merged with historical viewers.
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';

import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@colanode/ui/components/ui/hover-card';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useNodeViews } from '@colanode/ui/hooks/use-node-views';
import { usePresences } from '@colanode/ui/hooks/use-presence';

interface NodePresenceViewersProps {
  nodeId: string;
}

// How many avatars to preview in the collapsed stack before the count.
const MAX_AVATARS = 4;

// A distinct person who is present now (online) and/or has viewed this node
// before. `lastViewedAt` is only known for a recorded historical view.
interface MergedViewer {
  userId: string;
  online: boolean;
  lastViewedAt: string | null;
}

// Resolves one user's (name + avatar) from the workspace users collection — the
// same source NodeViewedBy uses. Returns null while unresolved / deleted, so a
// missing user simply drops out instead of rendering broken.
const useViewerUser = (userId: string) => {
  const workspace = useWorkspace();
  const query = useLiveQuery(
    (q) =>
      q
        .from({ users: workspace.collections.users })
        .where(({ users }) => eq(users.id, userId))
        .select(({ users }) => ({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }))
        .findOne(),
    [userId]
  );

  return query.data ?? null;
};

// A small green dot marking someone currently present on the node.
const OnlineDot = () => (
  <span
    className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-green-500 ring-2 ring-background"
    aria-hidden
  />
);

// A single avatar chip in the collapsed stack. Online people are lifted above
// their neighbours (higher z-index) so their green dot is never clipped by the
// avatar overlapping to their right.
const StackAvatar = ({
  userId,
  online,
  zIndex,
}: {
  userId: string;
  online: boolean;
  zIndex: number;
}) => {
  const user = useViewerUser(userId);
  if (!user) {
    return null;
  }

  return (
    <span className="relative inline-flex" style={{ zIndex }}>
      <Avatar
        id={user.id}
        name={user.name}
        avatar={user.avatar}
        size="small"
        className="rounded-full ring-2 ring-background"
      />
      {online && <OnlineDot />}
    </span>
  );
};

// A row in the hover popover: avatar + name + either an "online now" badge or a
// relative "viewed X ago".
const ViewerRow = ({ viewer }: { viewer: MergedViewer }) => {
  const user = useViewerUser(viewer.userId);
  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
      <span className="relative inline-flex shrink-0">
        <Avatar
          id={user.id}
          name={user.name}
          avatar={user.avatar}
          size="small"
        />
        {viewer.online && <OnlineDot />}
      </span>
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm font-medium leading-tight">
          {user.name ?? 'Unknown user'}
        </span>
        {viewer.online ? (
          <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-green-500/10 px-1.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-500">
            <span className="size-1.5 rounded-full bg-green-500" aria-hidden />
            Online now
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {viewer.lastViewedAt
              ? `Viewed ${timeAgo(viewer.lastViewedAt)}`
              : 'Viewed'}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * A single combined pastille for a page/record that answers BOTH "who is here
 * right now?" (live presence, green dot) and "who has ever opened this?"
 * (historical viewers). Online people come first and are marked; a person who is
 * both present and a past viewer is shown once, marked online. Renders nothing
 * when there is neither presence nor a recorded view.
 */
export const NodePresenceViewers = ({ nodeId }: NodePresenceViewersProps) => {
  const workspace = useWorkspace();
  const presences = usePresences(nodeId);
  const { data: views } = useNodeViews(workspace.userId, nodeId);

  const merged = useMemo<MergedViewer[]>(() => {
    const byUser = new Map<string, MergedViewer>();

    // Online users first (dedupe a user across several devices).
    for (const presence of presences) {
      if (!byUser.has(presence.userId)) {
        byUser.set(presence.userId, {
          userId: presence.userId,
          online: true,
          lastViewedAt: null,
        });
      }
    }

    // Then historical viewers not already counted as online (a user who is both
    // present and a past viewer stays online, but we remember when they viewed).
    for (const view of views ?? []) {
      const existing = byUser.get(view.userId);
      if (existing) {
        existing.lastViewedAt = existing.lastViewedAt ?? view.lastViewedAt;
        continue;
      }
      byUser.set(view.userId, {
        userId: view.userId,
        online: false,
        lastViewedAt: view.lastViewedAt,
      });
    }

    return Array.from(byUser.values());
  }, [presences, views]);

  if (merged.length === 0) {
    return null;
  }

  const onlineCount = merged.filter((viewer) => viewer.online).length;
  const shown = merged.slice(0, MAX_AVATARS);
  const peopleWord = merged.length === 1 ? 'person' : 'people';
  const label =
    onlineCount > 0
      ? `${onlineCount} online now, ${merged.length} ${peopleWord}`
      : `Viewed by ${merged.length} ${peopleWord}`;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={label}
          title={label}
        >
          <span className="flex items-center -space-x-1.5">
            {shown.map((viewer, index) => (
              <StackAvatar
                key={viewer.userId}
                userId={viewer.userId}
                online={viewer.online}
                zIndex={shown.length - index}
              />
            ))}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {onlineCount > 0 && (
              <span
                className="size-1.5 rounded-full bg-green-500"
                aria-hidden
              />
            )}
            {merged.length}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="max-h-96 w-64 overflow-auto p-1">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {label}
        </div>
        <div className="flex flex-col">
          {merged.map((viewer) => (
            <ViewerRow key={viewer.userId} viewer={viewer} />
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
