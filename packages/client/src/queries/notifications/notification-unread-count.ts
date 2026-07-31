export type NotificationUnreadCountQueryInput = {
  type: 'notification.unread-count';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'notification.unread-count': {
      input: NotificationUnreadCountQueryInput;
      output: number;
    };
  }
}
