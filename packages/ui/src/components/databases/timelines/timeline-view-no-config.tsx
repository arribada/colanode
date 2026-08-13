// ABOUTME: Shown while a timeline has no start-date field -- it cannot place a
// ABOUTME: single record until it knows which date puts them on the axis.

import { useCallback } from 'react';

import { FieldCreatePopover } from '@colanode/ui/components/databases/fields/field-create-popover';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { TIMELINE_DATE_FIELDS } from '@colanode/ui/components/databases/timelines/timeline-config-settings';
import { Button } from '@colanode/ui/components/ui/button';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const TimelineViewNoConfig = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const dateFields = database.fields.filter((field) =>
    TIMELINE_DATE_FIELDS.includes(field.type)
  );

  const handleFieldSelect = useCallback(
    (fieldId: string) => {
      workspace.collections.nodes.update(view.id, (draft) => {
        if (draft.type !== 'database_view') {
          return;
        }

        draft.timeline = { ...(draft.timeline ?? {}), startFieldId: fieldId };
      });
    },
    [view.id]
  );

  return (
    <div className="flex w-full flex-col items-center justify-center pt-20">
      {dateFields.length > 0 ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm">
            Pick the date each record starts on. You can add an end date and
            change the scale afterwards, in the view settings.
          </p>
          <div className="w-90">
            <FieldSelect
              fields={dateFields}
              value={view.timeline?.startFieldId ?? null}
              onChange={handleFieldSelect}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm">
            This database has no date field, so there is nothing to lay records
            out along. Add one to get started.
          </p>
          <FieldCreatePopover
            button={
              <Button variant="outline" size="sm">
                Add field
              </Button>
            }
            types={TIMELINE_DATE_FIELDS}
            onSuccess={handleFieldSelect}
          />
        </div>
      )}
    </div>
  );
};
