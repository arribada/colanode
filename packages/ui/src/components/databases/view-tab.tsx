import { LocalDatabaseViewNode } from '@colanode/client/types';
import { ViewIcon } from '@colanode/ui/components/databases/view-icon';
import { cn } from '@colanode/ui/lib/utils';

interface ViewTabProps {
  view: LocalDatabaseViewNode;
  isActive: boolean;
  onClick: () => void;
}

export const ViewTab = ({ view, isActive, onClick }: ViewTabProps) => {
  return (
    <div
      role="presentation"
      className={cn(
        'inline-flex min-w-0 max-w-40 cursor-pointer flex-row items-center gap-1 border-b-2 p-1 pl-0 text-sm',
        isActive ? 'border-border' : 'border-transparent'
      )}
      onClick={() => onClick()}
      onKeyDown={() => onClick()}
    >
      <ViewIcon
        id={view.id}
        name={view.name}
        avatar={view.avatar}
        layout={view.layout}
        className="size-4 shrink-0"
      />
      <span className="truncate">{view.name}</span>
    </div>
  );
};
