// ABOUTME: Shared notification row — resolves the source node's name/avatar,
// ABOUTME: shows a relative timestamp, and on click marks read + navigates.
import { CheckCircle2, ListTodo } from 'lucide-react';

import type { SelectNotification } from '@colanode/client/databases';
import type { LocalNode } from '@colanode/client/types';
import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { usePageSuggestions } from '@colanode/ui/contexts/page-suggestions';
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
  // Public-share suggestions carry the visitor's name/email in the preview.
  if (type === 'share_suggestion') {
    try {
      const p = JSON.parse(preview) as {
        firstName?: string;
        lastName?: string;
        email?: string;
      };
      const who =
        [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email;
      if (who) {
        return `Suggestion from ${who}`;
      }
    } catch {
      // ignore malformed preview
    }
    return 'New suggestion';
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
    case 'task_assigned':
      return 'Task assigned to you';
    case 'task_status':
      return 'Task status changed';
    case 'share_suggestion':
      return 'New suggestion';
    case 'document_suggestion':
      return 'New edit suggestion';
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
  const { openSuggestions } = usePageSuggestions();
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

    // For an edit-suggestion notification, also open the review panel on the
    // target page so the owner immediately SEES the proposed change — otherwise,
    // if they are already on that page, navigating alone does nothing visible.
    if (
      notification.source_node_id &&
      (notification.type === 'share_suggestion' ||
        notification.type === 'document_suggestion')
    ) {
      openSuggestions(notification.source_node_id);
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
