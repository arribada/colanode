// ABOUTME: The "Group by" control in the view settings popover -- the only way
// ABOUTME: to CHANGE a grouping once one has been picked, not just set a first.
//
// The board and calendar each shipped a full-page group picker, but it renders
// only while `groupBy` is unset. The moment a field was chosen the picker was
// replaced by the columns it produced, and there was no way back: no way to
// regroup a board by Priority once it was grouped by Status, and no way to
// clear a grouping at all. This puts the same choice somewhere permanent.

import { X } from 'lucide-react';
import { useCallback } from 'react';

import { FieldType } from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

// Which field types can group each layout. A board makes columns out of
// discrete values, so it wants select-like fields; a calendar lays records on
// dates, so it wants date-like ones. Kept in step with the two full-page
// pickers (board-view-no-group, calendar-view-no-group) that use the same sets.
const GROUP_FIELDS: Partial<Record<string, FieldType[]>> = {
  board: ['select', 'multi_select', 'collaborator', 'created_by'],
  calendar: ['date', 'created_at', 'updated_at'],
  // The timeline draws swimlanes labelled with the option name, which only
  // select-like fields carry. A collaborator field would label them with raw
  // user ids, so it is left out until the labels can be resolved.
  timeline: ['select', 'multi_select'],
};

export const supportsGroupBy = (layout: string): boolean =>
  GROUP_FIELDS[layout] !== undefined;

export const ViewGroupBySettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const canEdit = database.canEdit && !database.isLocked;
  const allowed = GROUP_FIELDS[view.layout];

  const setGroupBy = useCallback(
    (fieldId: string | null) => {
      if (!canEdit) {
        return;
      }

      workspace.collections.nodes.update(view.id, (draft) => {
        if (draft.type !== 'database_view') {
          return;
        }

        draft.groupBy = fieldId;
      });
    },
    [view.id, canEdit]
  );

  if (!allowed) {
    return null;
  }

  const candidates = database.fields.filter((field) =>
    allowed.includes(field.type)
  );

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <p className="text-sm font-medium">Group by</p>
      {candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No field of this database can group a {view.layout}. Add a{' '}
          {view.layout === 'calendar' ? 'date' : 'select'} field first.
        </p>
      ) : (
        <div className="flex flex-row items-center gap-1">
          <div
            aria-disabled={!canEdit}
            className={cn(
              'min-w-0 flex-1',
              !canEdit && 'pointer-events-none opacity-50'
            )}
          >
            <FieldSelect
              fields={candidates}
              value={view.groupBy ?? null}
              onChange={(fieldId) => setGroupBy(fieldId)}
            />
          </div>
          {view.groupBy && canEdit && (
            <button
              type="button"
              title="Clear grouping"
              aria-label="Clear grouping"
              onClick={() => setGroupBy(null)}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
