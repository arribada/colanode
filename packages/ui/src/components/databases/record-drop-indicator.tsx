// ABOUTME: The blue bar that shows where a dragged record will land: above or
// ABOUTME: below a row or card, or left or right of a gallery card.
import { DropEdge } from '@colanode/ui/lib/record-position';
import { cn } from '@colanode/ui/lib/utils';

interface RecordDropIndicatorProps {
  edge: DropEdge | null;
  axis: 'vertical' | 'horizontal';
}

// The parent must be `relative`. The bar sits half outside its edge so two
// neighbours' bars meet in the gap between them rather than doubling up.
export const RecordDropIndicator = ({
  edge,
  axis,
}: RecordDropIndicatorProps) => {
  if (!edge) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute z-20 rounded-full bg-blue-500',
        axis === 'vertical' ? 'left-0 right-0 h-0.5' : 'top-0 bottom-0 w-0.5',
        axis === 'vertical' && edge === 'before' && '-top-px',
        axis === 'vertical' && edge === 'after' && '-bottom-px',
        axis === 'horizontal' && edge === 'before' && '-left-1.5',
        axis === 'horizontal' && edge === 'after' && '-right-1.5'
      )}
    />
  );
};
