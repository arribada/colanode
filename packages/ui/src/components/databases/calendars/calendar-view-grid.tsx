import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DayPicker, DayProps, getDefaultClassNames } from 'react-day-picker';

import {
  FieldAttributes,
  isSameDay,
  DatabaseViewFilterAttributes,
} from '@colanode/core';
import { LocalRecordNode } from '@colanode/client/types';
import { CalendarViewDay } from '@colanode/ui/components/databases/calendars/calendar-view-day';
import { buttonVariants } from '@colanode/ui/components/ui/button';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';
import { filterRecords } from '@colanode/ui/lib/databases';
import { cn, getDisplayedDates } from '@colanode/ui/lib/utils';

const toUTCDate = (dateParam: Date | string): Date => {
  const date = typeof dateParam === 'string' ? new Date(dateParam) : dateParam;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

// UTC midnight of whatever a date field stores, or null when it holds no date.
const fieldDay = (
  record: LocalRecordNode,
  fieldId: string | null | undefined
): Date | null => {
  if (!fieldId) {
    return null;
  }
  const value = record.fields[fieldId]?.value;
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  );
};

// Whether a record occupies `day`. With a range end field the record spans
// start..end inclusive; without one (or with an end before the start) it sits
// only on its start day, matching the non-range behaviour.
const recordCoversDay = (
  record: LocalRecordNode,
  startFieldId: string,
  endFieldId: string | null | undefined,
  day: Date
): boolean => {
  const start = fieldDay(record, startFieldId);
  if (!start) {
    return false;
  }
  const rawEnd = fieldDay(record, endFieldId);
  const end = rawEnd && rawEnd.getTime() >= start.getTime() ? rawEnd : start;
  const t = day.getTime();
  return t >= start.getTime() && t <= end.getTime();
};

interface CalendarViewGridProps {
  field: FieldAttributes;
}

export const CalendarViewGrid = ({ field }: CalendarViewGridProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const defaultClassNames = getDefaultClassNames();

  const [month, setMonth] = useState(new Date());
  const { first, last } = useMemo(() => getDisplayedDates(month), [month]);

  // A `date` grouping field may link a second date field as its range end; when
  // it does, records are drawn across every day they span, not just the start.
  const endFieldId =
    field.type === 'date' && field.endFieldId ? field.endFieldId : null;

  const filters: DatabaseViewFilterAttributes[] = useMemo(
    () => [
      ...view.filters,
      {
        id: 'start_date',
        type: 'field',
        // Fetch by START date on both bounds (records starting in the visible
        // window). Using the END field here dropped records whose end is blank;
        // multi-day spanning is handled client-side by recordCoversDay.
        fieldId: field.id,
        operator: 'is_on_or_after',
        value: first.toISOString(),
      },
      {
        id: 'end_date',
        type: 'field',
        fieldId: field.id,
        operator: 'is_on_or_before',
        value: last.toISOString(),
      },
    ],
    [view.filters, field.id, endFieldId, first, last]
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(filters, view.sorts);
  const records = data;

  // The visible month is a bounded date range (is_on_or_after / is_on_or_before
  // above), so eagerly pull every page until exhausted -- otherwise records
  // beyond the first page would silently vanish from the grid.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <DayPicker
      showOutsideDays
      className="p-3"
      month={month}
      onMonthChange={(month) => {
        setMonth(month);
      }}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString('default', { month: 'short' }),
      }}
      classNames={{
        root: cn('w-full', defaultClassNames.root),
        months: cn(
          'flex gap-4 flex-col md:flex-row relative w-full',
          defaultClassNames.months
        ),
        month: cn('flex flex-col w-full gap-4', defaultClassNames.month),
        nav: cn(
          'flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between',
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) aria-disabled:opacity-50 p-0 select-none size-7',
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) aria-disabled:opacity-50 p-0 select-none size-7',
          defaultClassNames.button_next
        ),
        month_caption: cn(
          'flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)',
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          'w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5',
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          'relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md',
          defaultClassNames.dropdown_root
        ),
        dropdown: cn('absolute inset-0 opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'select-none font-medium',
          'rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5',
          defaultClassNames.caption_label
        ),
        table: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none',
          defaultClassNames.weekday
        ),
        week: cn(
          'flex w-full mt-2 border-b first:border-t border-border',
          defaultClassNames.week
        ),
        week_number_header: cn(
          'select-none w-(--cell-size)',
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          'text-[0.8rem] select-none text-muted-foreground',
          defaultClassNames.week_number
        ),
        range_start: cn(
          'rounded-l-md bg-accent',
          defaultClassNames.range_start
        ),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn('rounded-r-md bg-accent', defaultClassNames.range_end),
        today: cn(
          'bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none',
          defaultClassNames.today
        ),
        outside: cn(
          'text-muted-foreground aria-selected:text-muted-foreground',
          defaultClassNames.outside
        ),
        disabled: cn(
          'text-muted-foreground opacity-50',
          defaultClassNames.disabled
        ),
        hidden: cn('invisible', defaultClassNames.hidden),
      }}
      components={{
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === 'left') {
            return (
              <ChevronLeft className={cn('size-4', className)} {...props} />
            );
          }

          if (orientation === 'right') {
            return (
              <ChevronRight className={cn('size-4', className)} {...props} />
            );
          }

          return <ChevronDown className={cn('size-4', className)} {...props} />;
        },
        Day: (props: DayProps) => {
          const day = toUTCDate(props.day.date);
          const filter: DatabaseViewFilterAttributes = {
            id: 'calendar_filter',
            type: 'field',
            fieldId: field.id,
            operator: 'is_equal_to',
            value: day.toISOString(),
          };

          // With a range end field, a record occupies every day from its start
          // to its end; otherwise it sits on the single matching day as before.
          const dayRecords = endFieldId
            ? records.filter((record) =>
                recordCoversDay(record, field.id, endFieldId, day)
              )
            : filterRecords(records, filter, field, workspace.userId);

          const canCreate =
            (field.type === 'created_at' &&
              isSameDay(props.day.date, new Date())) ||
            field.type === 'date';

          const onCreate =
            database.canCreateRecord && canCreate
              ? () => view.createRecord([filter])
              : undefined;

          return (
            <CalendarViewDay
              field={field}
              date={props.day.date}
              records={dayRecords}
              onCreate={onCreate}
              isOutside={props.day.outside}
            />
          );
        },
      }}
    />
  );
};
