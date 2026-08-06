// ABOUTME: Star toggle for the page/record top bar. Stars/unstars the node for the
// ABOUTME: current user and reflects state from the shared favorites live query.
import { Star } from 'lucide-react';
import { toast } from 'sonner';

import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  useFavorites,
  useInvalidateFavorites,
} from '@colanode/ui/hooks/use-favorites';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { cn } from '@colanode/ui/lib/utils';

interface NodeFavoriteButtonProps {
  nodeId: string;
}

export const NodeFavoriteButton = ({ nodeId }: NodeFavoriteButtonProps) => {
  const workspace = useWorkspace();
  const { data: favoriteIds } = useFavorites(workspace.userId);
  const invalidateFavorites = useInvalidateFavorites();
  const { mutate, isPending } = useMutation();

  const isFavorited = favoriteIds?.includes(nodeId) ?? false;

  const toggle = () => {
    if (isPending) {
      return;
    }

    mutate({
      input: isFavorited
        ? { type: 'node.favorite.remove', userId: workspace.userId, nodeId }
        : { type: 'node.favorite.add', userId: workspace.userId, nodeId },
      onSuccess: () => {
        invalidateFavorites(workspace.userId);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <button
      type="button"
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={isFavorited}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      data-testid={`node-favorite-button-${nodeId}`}
      className={cn(
        'flex cursor-pointer flex-row items-center gap-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground',
        isFavorited && 'text-yellow-500 hover:text-yellow-500'
      )}
      onClick={toggle}
    >
      <Star className={cn('size-4', isFavorited && 'fill-current')} />
    </button>
  );
};
