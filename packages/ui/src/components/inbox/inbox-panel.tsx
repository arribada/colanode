import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

// Renders a compact label for a notification row. Automation notifications
// (created locally by the client-side database automations engine) carry their
// message in preview.message; other notifications fall back to type + node id.
const getNotificationLabel = (
  type: string,
  preview: string,
  sourceNodeId: string
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
  return type + ' · ' + sourceNodeId;
};

interface InboxPanelProps {
  userId: string;
}

export const InboxPanel = ({ userId }: InboxPanelProps) => {
  const notificationsQuery = useLiveQuery({
    type: 'notification.list',
    userId,
  });

  const notifications = notificationsQuery.data ?? [];

  return (
    <div className="flex flex-col">
      {notifications.length === 0 && (
        <div className="p-4 text-sm text-muted-foreground">
          No notifications
        </div>
      )}
      {notifications.map((n) => (
        <button
          key={n.id}
          type="button"
          data-testid={`inbox-item-${n.id}`}
          data-unread={!n.read_at}
          className="text-left p-2 hover:bg-muted"
          onClick={() => {
            window.colanode.executeMutation({
              type: 'notification.read',
              userId,
              notificationId: n.id,
            });
          }}
        >
          <span className={n.read_at ? 'opacity-60' : 'font-semibold'}>
            {getNotificationLabel(n.type, n.preview, n.source_node_id)}
          </span>
        </button>
      ))}
    </div>
  );
};
