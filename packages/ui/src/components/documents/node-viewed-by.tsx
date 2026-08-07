// ABOUTME: A compact, historical "Viewed by N" indicator for a page/record — a
// ABOUTME: small stack of viewer avatars that opens a popover of everyone who has
// ABOUTME: ever opened this node, each with their last-viewed relative time.
import { eq, useLiveQuery } from '@tanstack/react-db';

import { NodeViewEntry } from '@colanode/client/mutations';
import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useNodeViews } from '@colanode/ui/hooks/use-node-views';

interface NodeViewedByProps {
  nodeId: string;
}

// How many avatars to preview in the collapsed indicator before the count.
const MAX_AVATARS = 3;

// Resolves one viewer's user (name + avatar) from the workspace users collection.
// Returns null while unresolved (or if the user was deleted / not yet synced), so
// a missing user simply drops out of the stack instead of rendering broken.
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

// A single small avatar chip in the collapsed stack.
const ViewerAvatar = ({ userId }: { userId: string }) => {
  const user = useViewerUser(userId);
  if (!user) {
    return null;
  }

  return (
    <Avatar
      id={user.id}
      name={user.name}
      avatar={user.avatar}
      size="small"
      className="rounded-full ring-2 ring-background"
    />
  );
};

// A row in the popover: avatar + name + relative last-viewed time.
const ViewerRow = ({ view }: { view: NodeViewEntry }) => {
  const user = useViewerUser(view.userId);
  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
      <Avatar id={user.id} name={user.name} avatar={user.avatar} size="small" />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm font-medium leading-tight">
          {user.name ?? 'Unknown user'}
        </span>
        <span className="text-xs text-muted-foreground">
          {timeAgo(view.lastViewedAt)}
        </span>
      </div>
    </div>
  );
};

/**
 * Historical "Viewed by N" control shown next to the live presence avatars. It is
 * deliberately quieter than presence (muted text, no colored ring) because it
 * answers "who has ever opened this?" rather than "who is here now?". Renders
 * nothing until at least one view has been recorded.
 */
export const NodeViewedBy = ({ nodeId }: NodeViewedByProps) => {
  const workspace = useWorkspace();
  const { data: views } = useNodeViews(workspace.userId, nodeId);

  if (!views || views.length === 0) {
    return null;
  }

  const shown = views.slice(0, MAX_AVATARS);
  const label = `Viewed by ${views.length} ${
    views.length === 1 ? 'person' : 'people'
  }`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-full px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={label}
          title={label}
        >
          <span className="flex items-center -space-x-1.5">
            {shown.map((view) => (
              <ViewerAvatar key={view.userId} userId={view.userId} />
            ))}
          </span>
          <span className="text-xs font-medium">Viewed by {views.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-64 overflow-auto p-1">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {label}
        </div>
        <div className="flex flex-col">
          {views.map((view) => (
            <ViewerRow key={view.userId} view={view} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
