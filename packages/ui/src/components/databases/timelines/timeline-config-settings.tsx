// ABOUTME: Timeline settings (start field, end field, scale) rendered inside
// ABOUTME: the shared view settings popover as its layout-specific slot.

import { DatabaseViewTimelineAttributes, FieldType } from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { TimelineScale } from '@colanode/ui/components/databases/timelines/timeline';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

// created_at / updated_at are legitimate axes -- "when was this raised" is a
// real timeline -- so they are offered alongside plain date fields.
export const TIMELINE_DATE_FIELDS: FieldType[] = [
  'date',
  'created_at',
  'updated_at',
];

const SCALES: { value: TimelineScale; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export const TimelineConfigSettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const canEdit = database.canEdit && !database.isLocked;
  const timeline = view.timeline;

  const dateFields = database.fields.filter((field) =>
    TIMELINE_DATE_FIELDS.includes(field.type)
  );

  // A dependency source is a relation field pointing back at this same
  // database; following it from a record yields that record's predecessors.
  const dependencyFields = database.fields.filter(
    (field) =>
      field.type === 'relation' && field.databaseId === database.id
  );

  const updateTimeline = (patch: Partial<DatabaseViewTimelineAttributes>) => {
    if (!canEdit) {
      return;
    }

    workspace.collections.nodes.update(view.id, (draft) => {
      if (draft.type !== 'database_view') {
        return;
      }

      draft.timeline = { ...(draft.timeline ?? {}), ...patch };
    });
  };

  if (dateFields.length === 0) {
    return (
      <p className="py-1 text-xs text-muted-foreground">
        A timeline needs a date field. Add one to this database first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Start date</p>
        <div
          aria-disabled={!canEdit}
          className={cn(!canEdit && 'pointer-events-none opacity-50')}
        >
          <FieldSelect
            fields={dateFields}
            value={timeline?.startFieldId ?? null}
            onChange={(fieldId) => updateTimeline({ startFieldId: fieldId })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">End date</p>
        <div
          aria-disabled={!canEdit}
          className={cn(!canEdit && 'pointer-events-none opacity-50')}
        >
          <FieldSelect
            fields={dateFields}
            value={timeline?.endFieldId ?? null}
            onChange={(fieldId) => updateTimeline({ endFieldId: fieldId })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Records without an end date show as a single-day marker.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Dependencies</p>
        <div
          aria-disabled={!canEdit}
          className={cn(!canEdit && 'pointer-events-none opacity-50')}
        >
          {dependencyFields.length > 0 ? (
            <select
              aria-label="Dependency relation field"
              value={timeline?.dependencyFieldId ?? ''}
              disabled={!canEdit}
              onChange={(event) =>
                updateTimeline({
                  dependencyFieldId:
                    event.target.value === '' ? null : event.target.value,
                })
              }
              className="w-full cursor-pointer rounded-md border bg-background p-2 text-sm outline-none"
            >
              <option value="">None</option>
              {dependencyFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add a relation field pointing back to this database (e.g.
              &ldquo;Depends on&rdquo;) to draw arrows between tasks.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Draws an arrow from each related record (a predecessor) to this one.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Scale</p>
        <div className="grid grid-cols-3 gap-2">
          {SCALES.map((scale) => (
            <button
              key={scale.value}
              type="button"
              disabled={!canEdit}
              onClick={() => updateTimeline({ scale: scale.value })}
              className={cn(
                'cursor-pointer rounded-md border p-1.5 text-xs text-muted-foreground hover:bg-accent',
                (timeline?.scale ?? 'week') === scale.value &&
                  'border-foreground text-foreground'
              )}
            >
              {scale.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
