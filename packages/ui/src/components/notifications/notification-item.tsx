// ABOUTME: Shared notification row — resolves the source node's name/avatar,
// ABOUTME: shows a relative timestamp, and on click marks read + navigates.
import { CheckCircle2, ListTodo } from 'lucide-react';

import type { SelectNotification } from '@colanode/client/databases';
import type { LocalNode } from '@colanode/client/types';
import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

// Turn a notification's stored preview into a human label. Automation
// notifications (task assignments raised by the wiki-task automations) carry
// their message in preview.message; everything else falls back to a
// caller-supplied label (usually the resolved source-node name).
export const getNotificationMessage = (
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

// Human-readable fallback for when the source node has not resolved yet (source
// pages/records load on-demand). Keeps the raw enum type (e.g. "mention") from
// ever flashing in the row.
const getNotificationTypeLabel = (type: string): string => {
  switch (type) {
    case 'mention':
      return 'You were mentioned';
    case 'direct_message':
      return 'New message';
    case 'automation':
      return 'New task assigned';
    default:
      return 'New notification';
  }
};

interface NotificationItemProps {
  notification: SelectNotification;
  node: LocalNode | undefined | null;
  userId: string;
  // 'task' swaps the avatar for a checkbox-style icon (used by the home
  // dashboard's "Your wiki tasks" section); 'notification' (the default) shows
  // the source node's avatar.
  variant?: 'notification' | 'task';
  // Called with the source node id once the notification is marked read.
  // Navigation is the caller's job so this row stays route-agnostic.
  onNavigate?: (nodeId: string) => void;
  testId?: string;
}

export const NotificationItem = ({
  notification,
  node,
  userId,
  variant = 'notification',
  onNavigate,
  testId,
}: NotificationItemProps) => {
  const display = node ? getMentionNodeDisplay(node) : null;
  const fallback =
    variant === 'task'
      ? 'Task'
      : (display?.name ?? getNotificationTypeLabel(notification.type));
  const label = getNotificationMessage(
    notification.type,
    notification.preview,
    fallback
  );
  const unread = !notification.read_at;

  const handleClick = () => {
    window.colanode
      .executeMutation({
        type: 'notification.read',
        userId,
        notificationId: notification.id,
      })
      .catch(() => {});

    // Source pages/records load on-demand, so `node` is often undefined here;
    // navigate by the stored source id and let the route lazy-resolve it,
    // rather than silently doing nothing.
    if (onNavigate) {
      onNavigate(notification.source_node_id);
    }
  };

  return (
    <button
      type="button"
      data-testid={testId ?? `notification-item-${notification.id}`}
      data-unread={unread}
      onClick={handleClick}
      className="flex flex-row items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent"
    >
      {variant === 'task' ? (
        unread ? (
          <ListTodo className="size-4 shrink-0 text-blue-500" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
        )
      ) : (
        <Avatar
          size="small"
          id={notification.source_node_id}
          name={display?.name ?? label}
          avatar={display?.avatar}
        />
      )}
      <span
        className={`flex-1 truncate text-sm ${
          unread ? 'font-medium' : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
      {variant === 'notification' && unread ? (
        <span className="size-2 shrink-0 rounded-full bg-blue-500" />
      ) : null}
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
        {timeAgo(notification.created_at)}
      </span>
    </button>
  );
};
