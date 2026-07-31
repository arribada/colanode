import {
  MutationStatus,
  MuteSetMutation,
  generateId,
  IdType,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { WorkspaceContext } from '@colanode/server/types/api';

export const setNotificationMute = async (
  workspace: WorkspaceContext,
  mutation: MuteSetMutation
): Promise<MutationStatus> => {
  const updated = await database
    .insertInto('notification_mutes')
    .returningAll()
    .values({
      id: generateId(IdType.Node),
      user_id: workspace.user.id,
      node_id: mutation.data.nodeId,
      workspace_id: workspace.id,
      muted: mutation.data.muted,
      created_at: new Date(mutation.data.updatedAt),
    })
    .onConflict((oc) =>
      oc.columns(['user_id', 'node_id']).doUpdateSet({
        muted: mutation.data.muted,
        updated_at: new Date(mutation.data.updatedAt),
      })
    )
    .executeTakeFirst();

  if (updated) {
    eventBus.publish({
      type: 'notification.mute.updated',
      userId: workspace.user.id,
      nodeId: mutation.data.nodeId,
      workspaceId: workspace.id,
    });
  }

  return MutationStatus.OK;
};
