import { ChevronDown, Trash2 } from 'lucide-react';

import {
  FieldAttributes,
  DatabaseViewFieldFilterAttributes,
} from '@colanode/core';
import { FieldIcon } from '@colanode/ui/components/databases/fields/field-icon';
import { Button } from '@colanode/ui/components/ui/button';
import { DatePicker } from '@colanode/ui/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useViewFilter } from '@colanode/ui/hooks/use-view-filter';
import { dateFieldFilterOperators } from '@colanode/ui/lib/databases';

interface ViewDateFieldFilterProps {
  field: FieldAttributes;
  filter: DatabaseViewFieldFilterAttributes;
}

// Operators that need no value input at all.
const isOperatorWithoutValue = (operator: string) => {
  return (
    operator === 'is_empty' ||
    operator === 'is_not_empty' ||
    operator === 'is_today' ||
    operator === 'is_this_week' ||
    operator === 'is_this_month'
  );
};

export const ViewDateFieldFilter = ({
  field,
  filter,
}: ViewDateFieldFilterProps) => {
  const view = useDatabaseView();
  const { updateFilter, removeFilter } = useViewFilter({
    viewId: view.id,
    filterId: filter.id,
  });

  const operator =
    dateFieldFilterOperators.find(
      (operator) => operator.value === filter.operator
    ) ?? dateFieldFilterOperators[0];

  if (!operator) {
    return null;
  }

  const isBetween = operator.value === 'is_between';
  const dateTextValue = typeof filter.value === 'string' ? filter.value : null;
  const dateValue = dateTextValue ? new Date(dateTextValue) : null;

  // [start, end] ISO pair for the between range.
  const rangeValue = Array.isArray(filter.value)
    ? (filter.value as string[])
    : [];
  const rangeStart = rangeValue[0] ? new Date(rangeValue[0]) : null;
  const rangeEnd = rangeValue[1] ? new Date(rangeValue[1]) : null;

  const hideInput = isOperatorWithoutValue(operator.value);

  return (
    <Popover
      open={view.isFieldFilterOpened(filter.id)}
      onOpenChange={() => {
        if (view.isFieldFilterOpened(filter.id)) {
          view.closeFieldFilter(filter.id);
        } else {
          view.openFieldFilter(filter.id);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-dashed text-xs text-muted-foreground"
          data-testid={`view-filter-chip-${filter.id}`}
        >
          {field.name}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-96 flex-col gap-2 p-2">
        <div className="flex flex-row items-center gap-3 text-sm">
          <div className="flex flex-row items-center gap-0.5 p-1">
            <FieldIcon type={field.type} className="size-4" />
            <p>{field.name}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex grow flex-row items-center gap-1 rounded-md p-1 font-semibold cursor-pointer hover:bg-accent"
              >
                <p>{operator.label}</p>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {dateFieldFilterOperators.map((operator) => (
                <DropdownMenuItem
                  key={operator.value}
                  onSelect={() => {
                    updateFilter({
                      ...filter,
                      operator: operator.value,
                      value: isOperatorWithoutValue(operator.value)
                        ? null
                        : filter.value,
                    });
                  }}
                >
                  {operator.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            onClick={removeFilter}
            aria-label={`Remove ${field.name} filter`}
            data-testid={`view-filter-remove-${filter.id}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        {isBetween ? (
          <div className="flex items-center gap-2">
            <DatePicker
              value={rangeStart}
              onChange={(newValue) => {
                updateFilter({
                  ...filter,
                  value: [
                    newValue ? newValue.toISOString() : '',
                    rangeValue[1] ?? '',
                  ],
                });
              }}
              placeholder="From"
              className="flex h-full w-full cursor-pointer flex-row items-center gap-1 rounded-md border border-input p-2 text-sm"
            />
            <span className="text-muted-foreground">–</span>
            <DatePicker
              value={rangeEnd}
              onChange={(newValue) => {
                updateFilter({
                  ...filter,
                  value: [
                    rangeValue[0] ?? '',
                    newValue ? newValue.toISOString() : '',
                  ],
                });
              }}
              placeholder="To"
              className="flex h-full w-full cursor-pointer flex-row items-center gap-1 rounded-md border border-input p-2 text-sm"
            />
          </div>
        ) : (
          !hideInput && (
            <DatePicker
              value={dateValue}
              onChange={(newValue) => {
                if (newValue === null || newValue === undefined) {
                  updateFilter({
                    ...filter,
                    value: null,
                  });
                } else {
                  updateFilter({
                    ...filter,
                    value: newValue.toISOString(),
                  });
                }
              }}
              placeholder="Select date"
              className="flex h-full w-full cursor-pointer flex-row items-center gap-1 rounded-md border border-input p-2 text-sm"
            />
          )
        )}
      </PopoverContent>
    </Popover>
  );
};
