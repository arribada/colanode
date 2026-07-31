export type NotificationReadMutationInput = {
  type: 'notification.read';
  userId: string;
  notificationId: string;
};

export type NotificationReadMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'notification.read': {
      input: NotificationReadMutationInput;
      output: NotificationReadMutationOutput;
    };
  }
}
