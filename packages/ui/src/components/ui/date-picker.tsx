import { useEffect, useState } from 'react';

import { Calendar } from '@colanode/ui/components/ui/calendar';
import { Input } from '@colanode/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { cn } from '@colanode/ui/lib/utils';

interface DatePickerProps {
  value: Date | null;
  className?: string;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  readonly?: boolean;
}

const toUTCDate = (dateParam: Date | string): Date => {
  const date = typeof dateParam === 'string' ? new Date(dateParam) : dateParam;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

const fromUTCDate = (dateParam: Date | string): Date => {
  const date = typeof dateParam === 'string' ? new Date(dateParam) : dateParam;

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  return new Date(year, month, day, 0, 0, 0, 0);
};

// Parse a hand-typed date forgivingly. Tries day-first dd/mm/yyyy (with '/',
// '.' or '-' separators, 2- or 4-digit year) then falls back to the native
// Date parser (ISO etc.). Returns a LOCAL-time date at midnight (matching the
// calendar's own selection) or null when the text can't be understood — the
// caller treats null as "no change", so bad input is harmless.
const parseTypedDate = (text: string): Date | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) {
      year += 2000;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    const candidate = new Date(year, month - 1, day, 0, 0, 0, 0);
    // Reject rollovers like 31/02 -> 03 March.
    if (
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month - 1 ||
      candidate.getDate() !== day
    ) {
      return null;
    }
    return candidate;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    0,
    0,
    0,
    0
  );
};

// Seed the manual-entry field with the current value as dd/mm/yyyy.
const formatForInput = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).padStart(4, '0');
  return `${day}/${month}/${year}`;
};

export const DatePicker = ({
  value,
  className,
  onChange,
  placeholder,
  readonly,
}: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const dateObj = value ? fromUTCDate(value) : undefined;
  const placeHolderText = placeholder ?? '';

  // Re-seed the manual-entry field with the current value whenever the popover
  // opens, so typing always starts from what is currently selected.
  useEffect(() => {
    if (open) {
      setTyped(dateObj ? formatForInput(dateObj) : '');
    }
    // dateObj is derived from `value`; keying on its time avoids resetting the
    // field on every unrelated re-render while the popover stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateObj?.getTime()]);

  if (readonly) {
    return (
      <div
        className={cn(!dateObj && 'text-sm text-muted-foreground', className)}
      >
        {dateObj ? dateObj.toLocaleDateString() : ''}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={!dateObj && !placeHolderText ? 'Select date' : undefined}
          className={cn(
            'text-left',
            !dateObj && 'text-sm text-muted-foreground',
            className
          )}
        >
          {dateObj ? dateObj.toLocaleDateString() : placeHolderText}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={typed}
            placeholder="dd/mm/yyyy"
            aria-label="Type a date"
            className="h-8"
            onChange={(event) => {
              const next = event.target.value;
              setTyped(next);
              const parsed = parseTypedDate(next);
              if (parsed) {
                onChange(toUTCDate(parsed));
              } else if (next.trim() === '') {
                // Clearing the field clears the selection.
                onChange(null);
              }
              // Any other unparseable text is left as-is: no change.
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (parseTypedDate(typed) || typed.trim() === '') {
                  setOpen(false);
                }
              }
            }}
          />
        </div>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(2015, 0)}
          endMonth={new Date(2035, 11)}
          defaultMonth={dateObj ?? undefined}
          selected={dateObj ?? undefined}
          onSelect={(date) => {
            if (!date) {
              onChange(null);
            } else {
              onChange(toUTCDate(date));
            }
          }}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary field in popover, focus expected on open
          autoFocus={true}
        />
      </PopoverContent>
    </Popover>
  );
};
