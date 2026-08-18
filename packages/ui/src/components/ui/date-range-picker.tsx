import { useState } from 'react';
import { DateRange } from 'react-day-picker';

import { Calendar } from '@colanode/ui/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { cn } from '@colanode/ui/lib/utils';

interface DateRangePickerProps {
  start: Date | null;
  end: Date | null;
  className?: string;
  readonly?: boolean;
  onChange: (start: Date | null, end: Date | null) => void;
}

// Dates are stored at UTC midnight so the same calendar day shows everywhere
// regardless of the viewer's timezone. Convert both ways at the boundary.
const toUTCDate = (date: Date): Date =>
  new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  );

const fromUTCDate = (date: Date): Date =>
  new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0
  );

const label = (start: Date | null, end: Date | null): string => {
  if (!start && !end) {
    return '';
  }
  const s = start ? fromUTCDate(start).toLocaleDateString() : '…';
  if (!end) {
    return s;
  }
  return `${s} → ${fromUTCDate(end).toLocaleDateString()}`;
};

export const DateRangePicker = ({
  start,
  end,
  className,
  readonly,
  onChange,
}: DateRangePickerProps) => {
  const [open, setOpen] = useState(false);

  const selected: DateRange | undefined = start
    ? { from: fromUTCDate(start), to: end ? fromUTCDate(end) : undefined }
    : undefined;

  const text = label(start, end);

  if (readonly) {
    return (
      <div className={cn(!text && 'text-sm text-muted-foreground', className)}>
        {text}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={!text ? 'Select date range' : undefined}
          className={cn('text-left', !text && 'text-sm text-muted-foreground', className)}
        >
          {text || 'Start → due'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={selected}
          onSelect={(range) => {
            const from = range?.from ? toUTCDate(range.from) : null;
            const to = range?.to ? toUTCDate(range.to) : null;
            onChange(from, to);
          }}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- primary control in popover
          autoFocus={true}
        />
      </PopoverContent>
    </Popover>
  );
};
