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
import { WorkspaceContext } from '@colanode/server/types/api';

type CreateNotificationInput = {
  userId: string;
  workspaceId: string;
  rootId: string;
  type: 'mention' | 'direct_message' | 'task_assigned' | 'task_status';
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
