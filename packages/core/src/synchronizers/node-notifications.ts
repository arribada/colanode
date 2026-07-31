export type SyncNotificationsInput = {
  type: 'notifications';
};

export type SyncNotificationData = {
  id: string;
  userId: string;
  workspaceId: string;
  rootId: string;
  notificationType: 'mention' | 'direct_message' | 'task_assigned' | 'task_status';
  sourceNodeId: string;
  actorId: string | null;
  preview: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  revision: string;
};

declare module '@colanode/core' {
  interface SynchronizerMap {
    notifications: {
      input: SyncNotificationsInput;
      data: SyncNotificationData;
    };
  }
}
