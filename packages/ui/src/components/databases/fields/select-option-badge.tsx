import { getSelectOptionColorClass } from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

interface SelectOptionBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export const SelectOptionBadge = ({
  name,
  color,
  className,
}: SelectOptionBadgeProps) => {
  return (
    <div
      className={cn(
        // inline-flex overrides line-clamp's display, so clamp the inner text
        // instead: min-w-0 lets the badge shrink in a flex row and the span
        // truncates. w-max keeps it hugging its content when there is room.
        'inline-flex w-max min-w-0 items-center rounded-md border px-1 py-0.5 text-xs',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        getSelectOptionColorClass(color),
        className
      )}
    >
      <span className="min-w-0 truncate">{name}</span>
    </div>
  );
};
