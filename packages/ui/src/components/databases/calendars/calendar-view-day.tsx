import { Plus } from 'lucide-react';
import { useRef } from 'react';
import { useDrop } from 'react-dnd';

import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes, extractNodeRole, isSameDay } from '@colanode/core';
import { CalendarViewRecordCard } from '@colanode/ui/components/databases/calendars/calendar-view-record-card';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface CalendarViewDayProps {
  field: FieldAttributes;
  date: Date;
  records: LocalRecordNode[];
  isOutside: boolean;
  onCreate?: () => void;
}

export const CalendarViewDay = ({
  field,
  date,
  records,
  isOutside,
  onCreate,
}: CalendarViewDayProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const isToday = isSameDay(date, new Date());
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // Only real `date` fields can be rescheduled -- created_at / updated_at are
  // server-derived and read-only, so they accept no drops.
  const canDropHere = field.type === 'date' && !database.isLocked;

  const [{ isOver }, drop] = useDrop({
    accept: 'calendar-record',
    canDrop: () => canDropHere,
    drop: (item: { id: string; canEdit: boolean }) => {
      if (!canDropHere || !item.canEdit) {
        return;
      }

      const target = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
      ).toISOString();

      workspace.collections.nodes.update(item.id, (draft) => {
        if (draft.type !== 'record') {
          return;
        }

        draft.fields[field.id] = { type: 'string', value: target };
      });
    },
    collect: (monitor) => ({
      isOver: monitor.isOver() && monitor.canDrop(),
    }),
  });

  const tdRef = useRef<HTMLTableCellElement>(null);
  const dropRef = drop(tdRef);

  return (
    <td
      ref={dropRef as React.Ref<HTMLTableCellElement>}
      className={cn(
        'animate-fade-in group/calendar-day flex w-full flex-col gap-1 h-40 p-2 border-r first:border-l border-border overflow-auto',
        isOver && 'ring-2 ring-inset ring-primary/40'
      )}
    >
      <div
        className={cn(
          'flex w-full justify-end text-sm',
          isOutside ? 'text-muted-foreground' : ''
        )}
      >
        {onCreate && (
          <div className="grow">
            <button
              type="button"
              onClick={onCreate}
              aria-label="Add record"
              data-testid={`calendar-day-create-${localDate}`}
              className="cursor-pointer opacity-0 group-hover/calendar-day:opacity-100"
            >
              <Plus className="size-4" />
            </button>
          </div>
        )}
        <p
          className={
            isToday
              ? 'rounded-md bg-red-500 dark:bg-red-900 py-1 px-2 text-white'
              : ''
          }
        >
          {date.getDate()}
        </p>
      </div>
      {records.map((record) => {
        const role = extractNodeRole(record, workspace.userId) ?? database.role;

        return (
          <RecordProvider key={record.id} record={record} role={role}>
            <CalendarViewRecordCard field={field} />
          </RecordProvider>
        );
      })}
    </td>
  );
};
