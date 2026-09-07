import { Icon } from '@colanode/client/types';
import { IconElement } from '@colanode/ui/components/icons/icon-element';
import { useIconPicker } from '@colanode/ui/contexts/icon-picker';

interface IconPickerItemProps {
  icon: Icon;
}

export const IconPickerItem = ({ icon }: IconPickerItemProps) => {
  const { onPick: onIconClick } = useIconPicker();

  return (
    <button
      type="button"
      className="p-1 ring-border transition-colors duration-100 ease-in-out hover:bg-accent focus:border-border focus:outline-none focus:ring cursor-pointer"
      onClick={() => onIconClick(icon)}
      // Draggable so it can be dropped onto a surface that accepts an icon (the
      // whiteboard canvas). Harmless elsewhere — nothing else reads this type —
      // and a plain press still fires onClick.
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-colanode-icon', icon.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      aria-label={icon.name}
      data-testid={`icon-picker-item-${icon.id}`}
    >
      <IconElement className="h-5 w-5" id={icon.id} />
    </button>
  );
};
