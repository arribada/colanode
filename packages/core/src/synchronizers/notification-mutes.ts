export type SyncNotificationMutesInput = {
  type: 'notification-mutes';
};

export type SyncNotificationMuteData = {
  id: string;
  userId: string;
  nodeId: string;
  workspaceId: string;
  muted: boolean;
  createdAt: string;
  updatedAt: string | null;
  revision: string;
};

declare module '@colanode/core' {
  interface SynchronizerMap {
    'notification-mutes': {
      input: SyncNotificationMutesInput;
      data: SyncNotificationMuteData;
    };
  }
}
