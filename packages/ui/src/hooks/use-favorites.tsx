// ABOUTME: Shared reactive access to the current user's favorite node ids. Backed
// ABOUTME: by the server favorites list; add/remove invalidate this same key so the
// ABOUTME: star button and the sidebar Favorites section stay in sync everywhere.
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const favoritesQueryKey = (userId: string) => ['favorites', userId];

// One TanStack query, keyed only by userId, shared by every consumer. Both the
// page/record star toggle and the sidebar section read from it, so a change in
// one place re-renders the other after the mutation invalidates the key below.
export const useFavorites = (userId: string) => {
  return useQuery({
    queryKey: favoritesQueryKey(userId),
    queryFn: async (): Promise<string[]> => {
      const result = await window.colanode.executeMutation({
        type: 'node.favorite.list',
        userId,
      });

      if (result.success) {
        return result.output.nodeIds;
      }

      return [];
    },
  });
};

// Returns a callback that refetches the favorites list for a user. Call it after
// a favorite add/remove so every consumer of useFavorites updates.
export const useInvalidateFavorites = () => {
  const queryClient = useQueryClient();
  return (userId: string) =>
    queryClient.invalidateQueries({ queryKey: favoritesQueryKey(userId) });
};
