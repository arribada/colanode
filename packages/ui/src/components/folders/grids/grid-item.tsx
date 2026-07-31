import { useRef } from 'react';

import { useFolder } from '@colanode/ui/contexts/folder';
import { cn } from '@colanode/ui/lib/utils';

interface GridItemProps {
  id: string;
  children: React.ReactNode;
}

export const GridItem = ({ id, children }: GridItemProps) => {
  const folder = useFolder();

  const ref = useRef<HTMLDivElement>(null);
  const selected = false;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-testid={`folder-grid-item-${id}`}
      className={cn(
        'flex cursor-pointer select-none flex-col items-center gap-2 p-2',
        selected ? 'bg-accent' : 'hover:bg-accent'
      )}
      onClick={(event) => folder.onClick(event, id)}
      onDoubleClick={(event) => folder.onDoubleClick(event, id)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();

        // Synthesize a mouse-shaped event for the keyboard activation.
        // KeyboardEvent has no mouse-position/button data, so those fields
        // are defaulted to inert values instead of being blindly cast from
        // fields that don't exist on the source event.
        const mouseEvent: React.MouseEvent<HTMLElement> = {
          ...event,
          button: 0,
          buttons: 0,
          clientX: 0,
          clientY: 0,
          movementX: 0,
          movementY: 0,
          pageX: 0,
          pageY: 0,
          relatedTarget: null,
          screenX: 0,
          screenY: 0,
          nativeEvent: event.nativeEvent as unknown as MouseEvent,
        };

        folder.onDoubleClick(mouseEvent, id);
      }}
    >
      {children}
    </div>
  );
};
