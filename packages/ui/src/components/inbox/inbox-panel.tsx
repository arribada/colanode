// ABOUTME: Inbox sidebar panel — lists the user's notifications with resolved
// ABOUTME: names/avatars; a row marks read + navigates, plus mark-all-as-read.
import { inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { CheckCheck } from 'lucide-react';
import { useMemo } from 'react';

import { NotificationItem } from '@colanode/ui/components/notifications/notification-item';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery as useClientQuery } from '@colanode/ui/hooks/use-live-query';

interface InboxPanelProps {
  userId: string;
}

export const InboxPanel = ({ userId }: InboxPanelProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  const notificationsQuery = useClientQuery({
    type: 'notification.list',
    userId,
  });

  const notifications = notificationsQuery.data ?? [];

  // Resolve only the notifications' source nodes by id, instead of scanning
  // every page/record/space in the workspace just to name a handful of rows.
  const sourceNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notifications) {
      ids.add(n.source_node_id);
    }
    return [...ids];
  }, [notifications]);

  const nodeListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.id, sourceNodeIds)),
    [sourceNodeIds.join(',')]
  );

  const nodeById = useMemo(
    () => new Map((nodeListQuery.data ?? []).map((node) => [node.id, node])),
    [nodeListQuery.data]
  );

  const unread = notifications.filter((n) => !n.read_at);

  const handleNavigate = (nodeId: string) => {
    navigate({
      to: '/workspace/$userId/$nodeId',
      params: { userId, nodeId },
    });
  };

  const markAllRead = () => {
    window.colanode
      .executeMutation({
        type: 'notification.read.all',
        userId,
      })
      .catch(() => {});
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border p-2">
        <span className="text-sm font-medium">Inbox</span>
        <button
          type="button"
          data-testid="inbox-mark-all-read"
          onClick={markAllRead}
          disabled={unread.length === 0}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <CheckCheck className="size-3.5" />
          Mark all as read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          No notifications
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 p-1">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              node={nodeById.get(n.source_node_id)}
              userId={userId}
              onNavigate={handleNavigate}
              testId={`inbox-item-${n.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
