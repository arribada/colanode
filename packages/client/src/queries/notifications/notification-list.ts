import { SelectNotification } from '@colanode/client/databases/workspace/schema';

export type NotificationListQueryInput = {
  type: 'notification.list';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'notification.list': {
      input: NotificationListQueryInput;
      output: SelectNotification[];
    };
  }
}
