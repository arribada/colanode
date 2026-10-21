import { Check, GripVertical, Plus, X } from 'lucide-react';
import { Fragment, useState } from 'react';

import {
  compareString,
  generateFractionalIndex,
  generateId,
  IdType,
  MultiSelectFieldAttributes,
  SelectFieldAttributes,
  SelectOptionAttributes,
} from '@colanode/core';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { SelectOptionBadge } from '@colanode/ui/components/databases/fields/select-option-badge';
import { SelectOptionSettingsPopover } from '@colanode/ui/components/databases/fields/select-option-settings-popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@colanode/ui/components/ui/command';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMoveSelectOption } from '@colanode/ui/hooks/use-field-reorder';
import { useReorderItem } from '@colanode/ui/hooks/use-index-reorder';
import { getRandomSelectOptionColor } from '@colanode/ui/lib/databases';
import { ReorderEdge, sortByIndex } from '@colanode/ui/lib/reorder-index';
import { cn } from '@colanode/ui/lib/utils';

interface SelectFieldOptionsProps {
  field: SelectFieldAttributes | MultiSelectFieldAttributes;
  values: string[];
  onSelect: (id: string) => void;
  allowAdd: boolean;
}

export const SelectFieldOptions = ({
  field,
  values,
  onSelect,
  allowAdd,
}: SelectFieldOptionsProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const selectOptions = sortByIndex(Object.values(field.options ?? {}));

  const optionsReorder = useMoveSelectOption(field);

  const [inputValue, setInputValue] = useState('');
  const [color, setColor] = useState(getRandomSelectOptionColor());
  const showNewOption =
    database.canEdit &&
    allowAdd &&
    !selectOptions.some((option) => option.name === inputValue.trim());

  return (
    <Command className="min-h-min">
      <CommandInput
        placeholder="Search options..."
        className="h-9"
        value={inputValue}
        onValueChange={setInputValue}
      />
      <CommandEmpty>
        {database.canEdit && allowAdd
          ? 'Type a name and press Enter to create an option.'
          : 'No options found.'}
      </CommandEmpty>
      <CommandList>
        <CommandGroup className="h-min">
          {selectOptions.map((option) => (
            <SelectFieldOptionItem
              key={option.id}
              field={field}
              option={option}
              isSelected={values.includes(option.id)}
              onSelect={onSelect}
              canReorder={optionsReorder.canReorder && inputValue.trim() === ''}
              onMove={optionsReorder.move}
            />
          ))}
        </CommandGroup>
        <CommandGroup>
          {showNewOption && inputValue.length > 0 && (
            <CommandItem
              key={inputValue.trim()}
              value={inputValue.trim()}
              data-testid="select-field-option-create"
              onSelect={() => {
                if (inputValue.trim().length === 0) {
                  return;
                }

                const id = generateId(IdType.SelectOption);
                const nodes = workspace.collections.nodes;
                nodes.update(database.id, (draft) => {
                  if (draft.type !== 'database') {
                    return;
                  }

                  const fieldAttributes = draft.fields[field.id];
                  if (!fieldAttributes) {
                    return;
                  }

                  if (
                    fieldAttributes.type !== 'select' &&
                    fieldAttributes.type !== 'multi_select'
                  ) {
                    return;
                  }

                  const selectOptions = {
                    ...(fieldAttributes.options ?? {}),
                  };

                  const maxIndex = Object.values(selectOptions)
                    .map((selectOption) => selectOption.index)
                    .sort((a, b) => -compareString(a, b))[0];

                  const index = generateFractionalIndex(maxIndex, null);
                  selectOptions[id] = {
                    id,
                    index,
                    name: inputValue.trim(),
                    color,
                  };

                  draft.fields[field.id] = {
                    ...fieldAttributes,
                    options: selectOptions,
                  };
                });

                onSelect(id);
                setInputValue('');
                setColor(getRandomSelectOptionColor());
              }}
              className="flex flex-row items-center gap-2"
            >
              <span className="text-xs text-muted-foreground">Create</span>
              <SelectOptionBadge name={inputValue} color={color} />
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

interface SelectFieldOptionItemProps {
  field: SelectFieldAttributes | MultiSelectFieldAttributes;
  option: SelectOptionAttributes;
  isSelected: boolean;
  onSelect: (id: string) => void;
  // Off while something is typed: a filtered list is not the whole order.
  canReorder: boolean;
  onMove: (draggedId: string, targetId: string, edge: ReorderEdge) => void;
}

// One option of the list. Its grip drags it above or below another option,
// which reorders the field's options everywhere -- board columns included.
const SelectFieldOptionItem = ({
  field,
  option,
  isSelected,
  onSelect,
  canReorder,
  onMove,
}: SelectFieldOptionItemProps) => {
  const dnd = useReorderItem({
    type: `select-option:${field.id}`,
    id: option.id,
    axis: 'vertical',
    enabled: canReorder,
    onMove,
  });

  return (
    <CommandItem
      value={option.name}
      onSelect={() => {
        onSelect(option.id);
      }}
      className="group flex w-full cursor-pointer flex-row items-center gap-1"
      data-testid={`select-field-option-${option.id}`}
      aria-checked={isSelected}
    >
      <div
        ref={(node) => {
          dnd.elementRef.current = node;
          dnd.drop(node);
          dnd.preview(node);
        }}
        className={cn(
          'relative flex w-full min-w-0 flex-row items-center gap-1',
          dnd.isDragging && 'opacity-40'
        )}
      >
        <DropIndicator edge={dnd.dropEdge} axis="vertical" />
        {canReorder && (
          <span
            ref={(node) => {
              dnd.drag(node);
            }}
            role="presentation"
            title="Drag to reorder"
            data-testid={`select-field-option-grip-${option.id}`}
            className="-ml-1 flex shrink-0 cursor-grab items-center opacity-0 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <GripVertical className="size-3.5" />
          </span>
        )}
        <div className="flex-1">
          <SelectOptionBadge name={option.name} color={option.color} />
        </div>
        <div className="flex flex-row items-center gap-2">
          {isSelected ? (
            <Fragment>
              <Check className="size-4 group-hover:hidden" />
              <X className="hidden size-4 group-hover:block" />
            </Fragment>
          ) : (
            <Plus className="hidden size-4 group-hover:block" />
          )}
        </div>
        <div
          role="presentation"
          className="opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          <SelectOptionSettingsPopover option={option} fieldId={field.id} />
        </div>
      </div>
    </CommandItem>
  );
};
