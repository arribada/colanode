import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

export const useChannelMute = (userId: string, nodeId: string) => {
  const query = useLiveQuery({ type: 'notification-mute.get', userId, nodeId });
  return { muted: query.data?.muted ?? false };
};
