import { CircleDashed, EyeOff } from 'lucide-react';

import {
  DatabaseViewFilterAttributes,
  SelectFieldAttributes,
  SelectOptionAttributes,
} from '@colanode/core';
import { BoardViewColumn } from '@colanode/ui/components/databases/boards/board-view-column';
import { SelectOptionBadge } from '@colanode/ui/components/databases/fields/select-option-badge';
import { BoardViewContext } from '@colanode/ui/contexts/board-view';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { getSelectOptionLightColorClass } from '@colanode/ui/lib/databases';

interface BoardViewColumnsSelectProps {
  field: SelectFieldAttributes;
}

export const BoardViewColumnsSelect = ({
  field,
}: BoardViewColumnsSelectProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const selectOptionCountQuery = useLiveQuery({
    type: 'record.field.value.count',
    databaseId: database.id,
    filters: view.filters,
    fieldId: field.id,
    userId: workspace.userId,
  });

  const selectOptions = Object.values(field.options ?? {});
  // Options hidden via the column "hide" button: an is_not_in filter on this
  // field. Skipping them removes the whole column while the (editable) filter
  // keeps the records out.
  const hideFilter = (view.filters ?? []).find(
    (f) =>
      f.type === 'field' && f.fieldId === field.id && f.operator === 'is_not_in'
  );
  const hiddenIds = new Set<string>(
    hideFilter && hideFilter.type === 'field' && Array.isArray(hideFilter.value)
      ? (hideFilter.value as string[])
      : []
  );
  const visibleOptions = selectOptions.filter(
    (option) => !hiddenIds.has(option.id)
  );
  const noValueFilter: DatabaseViewFilterAttributes = {
    id: '1',
    type: 'field',
    fieldId: field.id,
    operator: 'is_empty',
  };

  const selectOptionCount = selectOptionCountQuery.data?.values ?? [];
  const noValueCount = selectOptionCountQuery.data?.noValueCount ?? 0;

  const noValueDraggingClass = getSelectOptionLightColorClass('gray');

  return (
    <>
      {visibleOptions.map((option) => {
        const filter: DatabaseViewFilterAttributes = {
          id: '1',
          type: 'field',
          fieldId: field.id,
          operator: 'is_in',
          value: [option.id],
        };

        const draggingClass = getSelectOptionLightColorClass(
          option.color ?? 'gray'
        );

        const count =
          selectOptionCount.find((count) => count.value === option.id)?.count ??
          0;

        return (
          <BoardViewContext.Provider
            key={option.id}
            value={{
              field,
              filter,
              canDrop: () => true,
              drop: () => {
                return {
                  type: 'string',
                  value: option.id,
                };
              },
              dragOverClass: draggingClass,
              columnClass: draggingClass,
              header: (
                <BoardViewColumnSelectHeader
                  field={field}
                  option={option}
                  count={count}
                  onHide={() => view.hideColumnValue(field.id, option.id)}
                />
              ),
              canDrag: (record) => record.canEdit,
              onDragEnd: async (record, value) => {
                const nodes = workspace.collections.nodes;
                if (!value) {
                  nodes.update(record.id, (draft) => {
                    if (draft.type !== 'record') {
                      return;
                    }

                    const { [field.id]: _removed, ...rest } = draft.fields;
                    draft.fields = rest;
                  });
                } else {
                  nodes.update(record.id, (draft) => {
                    if (draft.type !== 'record') {
                      return;
                    }

                    draft.fields[field.id] = value;
                  });
                }
              },
            }}
          >
            <BoardViewColumn />
          </BoardViewContext.Provider>
        );
      })}
      <BoardViewContext.Provider
        value={{
          field,
          filter: noValueFilter,
          canDrop: () => true,
          drop: () => {
            return null;
          },
          header: (
            <BoardViewColumnSelectHeader
              field={field}
              option={null}
              count={noValueCount}
            />
          ),
          dragOverClass: noValueDraggingClass,
          columnClass: noValueDraggingClass,
          canDrag: () => true,
          onDragEnd: async (record, value) => {
            const nodes = workspace.collections.nodes;
            if (!value) {
              nodes.update(record.id, (draft) => {
                if (draft.type !== 'record') {
                  return;
                }

                const { [field.id]: _removed, ...rest } = draft.fields;
                draft.fields = rest;
              });
            } else {
              nodes.update(record.id, (draft) => {
                if (draft.type !== 'record') {
                  return;
                }

                draft.fields[field.id] = value;
              });
            }
          },
        }}
      >
        <BoardViewColumn />
      </BoardViewContext.Provider>
    </>
  );
};

interface BoardViewColumnSelectHeaderProps {
  field: SelectFieldAttributes;
  option: SelectOptionAttributes | null;
  count: number;
  onHide?: () => void;
}

const BoardViewColumnSelectHeader = ({
  field,
  option,
  count,
  onHide,
}: BoardViewColumnSelectHeaderProps) => {
  if (!option) {
    return (
      <div className="group/col flex min-w-0 w-full flex-row items-center gap-2">
        <CircleDashed className="size-5 shrink-0" />
        <p className="truncate text-muted-foreground">No {field.name}</p>
        <p className="ml-1 shrink-0 text-sm text-muted-foreground">
          {count.toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="group/col flex min-w-0 w-full flex-row items-center gap-2">
      <SelectOptionBadge
        name={option.name}
        color={option.color}
        className="max-w-full"
      />
      <p className="ml-1 shrink-0 text-sm text-muted-foreground">
        {count.toLocaleString()}
      </p>
      {onHide && (
        <button
          type="button"
          title="Hide this column"
          aria-label="Hide column"
          onClick={onHide}
          className="ml-auto hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground group-hover/col:block"
        >
          <EyeOff className="size-4" />
        </button>
      )}
    </div>
  );
};
