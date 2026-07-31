export type NotificationMuteGetQueryInput = {
  type: 'notification-mute.get';
  userId: string;
  nodeId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'notification-mute.get': {
      input: NotificationMuteGetQueryInput;
      output: { muted: boolean };
    };
  }
}
