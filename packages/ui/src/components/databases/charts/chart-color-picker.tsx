// ABOUTME: Colour picker for one chart series, opened from the legend swatch —
// ABOUTME: the place you look when you want to change a colour.
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { PALETTE } from '@colanode/ui/components/databases/charts/chart-aggregation';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { cn } from '@colanode/ui/lib/utils';

// The eight select-option colours first, so a chart grouped by a select can be
// nudged back to the palette its options already use, then the categorical
// fallbacks for everything else.
const SWATCHES: string[] = [
  '#6b7280',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#ef4444',
  ...PALETTE.filter(
    (c) =>
      ![
        '#3b82f6',
        '#22c55e',
        '#f97316',
        '#a855f7',
        '#ec4899',
        '#eab308',
        '#ef4444',
      ].includes(c)
  ),
];

interface ChartColorPickerProps {
  label: string;
  color: string;
  /** Whether this series currently carries a colour the user picked. */
  isCustom: boolean;
  readOnly?: boolean;
  onPick: (color: string) => void;
  onReset: () => void;
}

export const ChartColorPicker = ({
  label,
  color,
  isCustom,
  readOnly,
  onPick,
  onReset,
}: ChartColorPickerProps) => {
  const [open, setOpen] = useState(false);

  if (readOnly) {
    return (
      <span
        className="size-3 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change the colour of ${label}`}
          title={`Change the colour of ${label}`}
          className={cn(
            'size-3 shrink-0 cursor-pointer rounded-sm ring-offset-1 ring-offset-background transition-shadow',
            'hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
          )}
          style={{ backgroundColor: color }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="mb-2 max-w-40 truncate text-xs font-medium">{label}</p>
        <div className="grid grid-cols-6 gap-1.5">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              onClick={() => {
                onPick(swatch);
                setOpen(false);
              }}
              className={cn(
                'size-5 cursor-pointer rounded-sm ring-offset-1 ring-offset-background hover:ring-2 hover:ring-ring',
                swatch.toLowerCase() === color.toLowerCase() &&
                  'ring-2 ring-foreground'
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
        {isCustom && (
          <button
            type="button"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
            className="mt-2 flex w-full cursor-pointer items-center gap-1.5 rounded-md p-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            Back to the default
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};
