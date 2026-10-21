import { Eye, EyeOff, GripVertical, Trash2 } from 'lucide-react';
import { Fragment, useCallback, useMemo, useState } from 'react';

import { FieldAttributes } from '@colanode/core';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { FieldDeleteDialog } from '@colanode/ui/components/databases/fields/field-delete-dialog';
import { FieldIcon } from '@colanode/ui/components/databases/fields/field-icon';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useDatabaseViews } from '@colanode/ui/contexts/database-views';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMoveViewField } from '@colanode/ui/hooks/use-field-reorder';
import { useReorderItem } from '@colanode/ui/hooks/use-index-reorder';
import { ReorderEdge, sortByIndex } from '@colanode/ui/lib/reorder-index';
import { cn } from '@colanode/ui/lib/utils';

interface MutationInput {
  id: string;
  display: boolean;
}

export const ViewFieldSettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);

  // The properties in this view's order -- its own index for a property, else
  // the database's -- not in the order the database happens to store them.
  const { views } = useDatabaseViews();
  const viewFieldIndexes = views.find((v) => v.id === view.id)?.fields;
  const items = useMemo(
    () =>
      database.fields.map((field) => ({
        id: field.id,
        index: viewFieldIndexes?.[field.id]?.index ?? field.index,
      })),
    [database.fields, viewFieldIndexes]
  );
  const orderedFields = sortByIndex(items)
    .map((item) => database.fields.find((field) => field.id === item.id))
    .filter((field): field is FieldAttributes => field !== undefined);
  const fieldsReorder = useMoveViewField(view.id, items);

  const handleDisplayChange = useCallback(
    (input: MutationInput) => {
      workspace.collections.nodes.update(view.id, (draft) => {
        if (draft.type !== 'database_view') {
          return;
        }

        const draftField = draft.fields?.[input.id];
        if (draftField && draftField.display === input.display) {
          return;
        }

        if (draftField) {
          draftField.display = input.display;
          return;
        }

        draft.fields = {
          ...draft.fields,
          [input.id]: {
            id: input.id,
            display: input.display,
          },
        };
      });
    },
    [view.id]
  );

  return (
    <Fragment>
      <div className="flex flex-col gap-2 text-sm">
        <p className="my-1 font-semibold">
          Property visibility{' '}
          <span className="text-muted-foreground">({view.fields.length})</span>
        </p>
        {orderedFields.map((field) => {
          const isDisplayed =
            view.fields.find((f) => f.field.id === field.id)?.display ?? false;

          return (
            <ViewFieldSettingsRow
              key={field.id}
              fieldId={field.id}
              canReorder={fieldsReorder.canReorder}
              onMove={fieldsReorder.move}
            >
              <div className="flex flex-row items-center gap-2">
                {fieldsReorder.canReorder && (
                  <GripVertical className="size-3.5 cursor-grab text-muted-foreground opacity-0 group-hover/field:opacity-100" />
                )}
                <FieldIcon type={field.type} className="size-4" />
                <div>{field.name}</div>
              </div>
              <div className="flex flex-row items-center gap-2">
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    className={cn(
                      database.canEdit && !database.isLocked
                        ? 'cursor-pointer'
                        : 'opacity-50'
                    )}
                    onClick={() => {
                      if (!database.canEdit || database.isLocked) return;

                      handleDisplayChange({
                        id: field.id,
                        display: !isDisplayed,
                      });
                    }}
                  >
                    {isDisplayed ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent className="flex flex-row items-center gap-2">
                    {isDisplayed
                      ? 'Hide field from this view'
                      : 'Show field in this view'}
                  </TooltipContent>
                </Tooltip>
                {database.canEdit && !database.isLocked && (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="cursor-pointer"
                      onClick={() => {
                        setDeleteFieldId(field.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent className="flex flex-row items-center gap-2">
                      Delete field from database
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </ViewFieldSettingsRow>
          );
        })}
      </div>
      {deleteFieldId && (
        <FieldDeleteDialog
          id={deleteFieldId}
          open={!!deleteFieldId}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteFieldId(null);
            }
          }}
        />
      )}
    </Fragment>
  );
};

interface ViewFieldSettingsRowProps {
  fieldId: string;
  canReorder: boolean;
  onMove: (draggedId: string, targetId: string, edge: ReorderEdge) => void;
  children: React.ReactNode;
}

// One property in the view's list, dragged above or below another to reorder
// the view's columns and card fields.
const ViewFieldSettingsRow = ({
  fieldId,
  canReorder,
  onMove,
  children,
}: ViewFieldSettingsRowProps) => {
  const view = useDatabaseView();
  const dnd = useReorderItem({
    type: `view-field:${view.id}`,
    id: fieldId,
    axis: 'vertical',
    enabled: canReorder,
    onMove,
  });

  return (
    <div
      ref={(node) => {
        dnd.elementRef.current = node;
        dnd.drag(dnd.drop(node));
      }}
      data-testid={`view-field-settings-row-${fieldId}`}
      className={cn(
        'group/field relative flex flex-row items-center justify-between gap-2 p-0.5',
        'cursor-pointer rounded-md hover:bg-accent',
        dnd.isDragging && 'opacity-40'
      )}
    >
      <DropIndicator edge={dnd.dropEdge} axis="vertical" />
      {children}
    </div>
  );
};
