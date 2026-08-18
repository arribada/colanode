// ABOUTME: Date-field setting to link a second date field as its range "end",
// ABOUTME: so the field's picker sets a start + due range across both fields.
import { CalendarRange, Check } from 'lucide-react';

import { DateFieldAttributes } from '@colanode/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface FieldDateRangeProps {
  field: DateFieldAttributes;
}

export const FieldDateRange = ({ field }: FieldDateRangeProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const canEdit = database.canEdit && !database.isLocked;
  const dateFields = database.fields.filter(
    (candidate) => candidate.type === 'date' && candidate.id !== field.id
  );
  const current =
    field.endFieldId != null
      ? (database.fields.find((f) => f.id === field.endFieldId) ?? null)
      : null;

  // Stored on the field (database node) so every view's date picker behaves the
  // same. Mirrors FieldNumberFormat's discrete field-settings write.
  const setEnd = (endFieldId: string | null) => {
    if (!canEdit) {
      return;
    }
    workspace.collections.nodes.update(database.id, (draft) => {
      if (draft.type !== 'database') {
        return;
      }
      const attributes = draft.fields[field.id];
      if (!attributes || attributes.type !== 'date') {
        return;
      }
      attributes.endFieldId = endFieldId;
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-xs text-muted-foreground">
        Range end date (start → due)
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={!canEdit || dateFields.length === 0}
            className="flex flex-row items-center justify-between gap-2 rounded-sm p-1 text-sm hover:bg-accent disabled:cursor-default disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <CalendarRange className="size-4" />
              <span>{current?.name ?? 'None'}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            onSelect={() => setEnd(null)}
            className="flex items-center gap-2"
          >
            <Check
              className={cn('size-4', current === null ? 'opacity-100' : 'opacity-0')}
            />
            <span>None</span>
          </DropdownMenuItem>
          {dateFields.map((candidate) => (
            <DropdownMenuItem
              key={candidate.id}
              onSelect={() => setEnd(candidate.id)}
              className="flex items-center gap-2"
            >
              <Check
                className={cn(
                  'size-4',
                  current?.id === candidate.id ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span>{candidate.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
