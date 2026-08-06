import {
  MutationStatus,
  NotificationReadMutation,
  extractNodeRole,
  generateId,
  getIdType,
  hasNodeRole,
  IdType,
  Mention,
  Node,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNotification } from '@colanode/server/data/schema';
import { eventBus } from '@colanode/server/lib/event-bus';
import { notifyDashboard } from '@colanode/server/lib/dashboard/notifier';
import { notifyZulip } from '@colanode/server/lib/zulip/notifier';
import { WorkspaceContext } from '@colanode/server/types/api';

type CreateNotificationInput = {
  userId: string;
  workspaceId: string;
  rootId: string;
  type:
    | 'mention'
    | 'direct_message'
    | 'task_assigned'
    | 'task_status'
    | 'share_suggestion';
  sourceNodeId: string;
  actorId: string | null;
  preview: Record<string, unknown>;
};

export const createNotification = async (
  input: CreateNotificationInput
): Promise<SelectNotification | null> => {
  const existing = await database
    .selectFrom('notifications')
    .select(['id'])
    .where('user_id', '=', input.userId)
    .where('type', '=', input.type)
    .where('source_node_id', '=', input.sourceNodeId)
    .where('read_at', 'is', null)
    .executeTakeFirst();

  if (existing) {
    return null;
  }

  const created = await database
    .insertInto('notifications')
    .returningAll()
    .values({
      id: generateId(IdType.Notification),
      user_id: input.userId,
      workspace_id: input.workspaceId,
      root_id: input.rootId,
      type: input.type,
      source_node_id: input.sourceNodeId,
      actor_id: input.actorId,
      preview: input.preview,
      created_at: new Date(),
      read_at: null,
    })
    .executeTakeFirst();

  if (!created) {
    return null;
  }

  eventBus.publish({
    type: 'notification.created',
    notificationId: created.id,
    userId: created.user_id,
    workspaceId: created.workspace_id,
  });

  // Outgoing integration hook: relay this notification to a Zulip stream.
  // No-ops instantly when disabled (see lib/zulip/notifier.ts); when
  // enabled it fires-and-forgets, so a slow/down Zulip never delays or
  // fails notification creation.
  // External share-suggestion notifications stay in-app only.
  if (input.type !== 'share_suggestion') {
    const relayType = input.type;
    notifyZulip({
      userId: input.userId,
      workspaceId: input.workspaceId,
      rootId: input.rootId,
      type: relayType,
      sourceNodeId: input.sourceNodeId,
      actorId: input.actorId,
    });

    // Same shape, same guarantees: relay to the dashboard so one bell shows the
    // wiki, Plane and the dashboard together. Dormant unless ARRIBADA_NOTIFY_URL
    // and _SECRET are set, and never able to delay or fail what is already stored.
    notifyDashboard({
      userId: input.userId,
      workspaceId: input.workspaceId,
      rootId: input.rootId,
      type: relayType,
      sourceNodeId: input.sourceNodeId,
      actorId: input.actorId,
      notificationId: created.id,
    });
  }

  return created;
};

type CreateMentionNotificationsInput = {
  mentions: Mention[];
  workspaceId: string;
  rootId: string;
  rootNode: Node;
  sourceNodeId: string;
  actorId: string | null;
};

// Shared by the node notification pipeline (messages) and the document
// mutation path (pages/records). Mention targets are raw ids: user mentions
// notify, node mentions (pages, databases, records...) are wiki links and
// stay silent.
export const createMentionNotifications = async (
  input: CreateMentionNotificationsInput
): Promise<void> => {
  for (const mention of input.mentions) {
    const targetId = mention.target;
    if (getIdType(targetId) !== IdType.User) continue;
    if (targetId === input.actorId) continue;

    const role = extractNodeRole(input.rootNode, targetId);
    if (!role || !hasNodeRole(role, 'viewer')) continue;

    await createNotification({
      userId: targetId,
      workspaceId: input.workspaceId,
      rootId: input.rootId,
      type: 'mention',
      sourceNodeId: input.sourceNodeId,
      actorId: input.actorId,
      preview: {},
    });
  }
};

export const markNotificationRead = async (
  workspace: WorkspaceContext,
  mutation: NotificationReadMutation
): Promise<MutationStatus> => {
  const notification = await database
    .selectFrom('notifications')
    .selectAll()
    .where('id', '=', mutation.data.notificationId)
    .where('user_id', '=', workspace.user.id)
    .executeTakeFirst();

  if (!notification) {
    return MutationStatus.NOT_FOUND;
  }

  if (notification.read_at !== null) {
    return MutationStatus.OK;
  }

  const updated = await database
    .updateTable('notifications')
    .returningAll()
    .set({ read_at: new Date(mutation.data.readAt) })
    .where('id', '=', mutation.data.notificationId)
    .executeTakeFirst();

  if (updated) {
    eventBus.publish({
      type: 'notification.updated',
      notificationId: updated.id,
      userId: updated.user_id,
      workspaceId: updated.workspace_id,
    });
  }

  return MutationStatus.OK;
};
