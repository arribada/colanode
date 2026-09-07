// ABOUTME: Shared notification row — resolves the source node's name/avatar,
// ABOUTME: shows a relative timestamp, and on click marks read + navigates.
import type { SelectNotification } from '@colanode/client/databases';
import type { LocalNode } from '@colanode/client/types';
import { timeAgo } from '@colanode/core';
import { X } from 'lucide-react';
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
  // Called with the source node id once the notification is marked read.
  // Navigation is the caller's job so this row stays route-agnostic.
  onNavigate?: (nodeId: string) => void;
  // Called with the notification id when the user dismisses the row. The list
  // has no delete mutation, so "dismiss" marks the notification read (via the
  // existing mutation) and the caller removes it from the rendered list.
  onDismiss?: (notificationId: string) => void;
  testId?: string;
}

export const NotificationItem = ({
  notification,
  node,
  userId,
  onNavigate,
  onDismiss,
  testId,
}: NotificationItemProps) => {
  const display = node ? getMentionNodeDisplay(node) : null;
  const fallback =
    display?.name ?? getNotificationTypeLabel(notification.type);
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

  // Dismiss: no delete mutation exists, so mark the notification read (the same
  // mutation the row click and "mark all as read" use) and let the parent drop
  // it from the list. Stop propagation so dismissing never also navigates.
  const handleDismiss = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!notification.read_at) {
      window.colanode
        .executeMutation({
          type: 'notification.read',
          userId,
          notificationId: notification.id,
        })
        .catch(() => {});
    }
    onDismiss?.(notification.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={testId ?? `notification-item-${notification.id}`}
      data-unread={unread}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick();
        }
      }}
      className="group flex flex-row items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent cursor-pointer"
    >
      <Avatar
        size="small"
        id={notification.source_node_id}
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
        {timeAgo(notification.created_at)}
      </span>
      <button
        type="button"
        aria-label="Dismiss notification"
        data-testid={`notification-dismiss-${notification.id}`}
        onClick={handleDismiss}
        onKeyDown={(event) => {
          // Enter/Space on the dismiss button would otherwise bubble to the
          // row's onKeyDown and ALSO navigate -- stop it here.
          if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation();
          }
        }}
        className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};
