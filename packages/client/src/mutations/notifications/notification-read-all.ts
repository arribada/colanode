export type NotificationReadAllMutationInput = {
  type: 'notification.read.all';
  userId: string;
};

export type NotificationReadAllMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'notification.read.all': {
      input: NotificationReadAllMutationInput;
      output: NotificationReadAllMutationOutput;
    };
  }
}
