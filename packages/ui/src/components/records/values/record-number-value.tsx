import { useEffect, useState } from 'react';

import { NumberFieldValue, type NumberFieldAttributes } from '@colanode/core';
import { Input } from '@colanode/ui/components/ui/input';
import { useRecord } from '@colanode/ui/contexts/record';
import { useRecordField } from '@colanode/ui/hooks/use-record-field';
import { formatNumber, isNumericFormat } from '@colanode/ui/lib/number-format';

interface RecordNumberValueProps {
  field: NumberFieldAttributes;
  readOnly?: boolean;
}

export const RecordNumberValue = ({
  field,
  readOnly,
}: RecordNumberValueProps) => {
  const record = useRecord();
  const { value, setValue, clearValue } = useRecordField<NumberFieldValue>({
    field,
  });

  const [localValue, setLocalValue] = useState<string>(
    value?.value?.toString() ?? ''
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setLocalValue(value?.value?.toString() ?? '');
  }, [value?.value]);

  const handleBlur = () => {
    setFocused(false);
    if (!record.canEdit || readOnly) return;

    const trimmedValue = localValue.trim();
    if (trimmedValue === '') {
      clearValue();
      return;
    }

    const newValue = parseFloat(trimmedValue);
    if (isNaN(newValue)) {
      setLocalValue(value?.value?.toString() ?? '');
      return;
    }

    if (newValue === value?.value) {
      return;
    }

    setValue({
      type: 'number',
      value: newValue,
    });
  };

  // The read display honors the field's format; while the cell is being edited
  // (focused + editable) it shows the raw value so typing stays exact.
  const editing = focused && record.canEdit && !readOnly;
  const isNumericValue =
    localValue.trim() !== '' && Number.isFinite(Number(localValue));
  const displayValue =
    !editing && isNumericFormat(field.format) && isNumericValue
      ? formatNumber(Number(localValue), field.format)
      : localValue;

  // A percent field also draws a thin progress bar along the bottom of the cell
  // (clamped 0-100), so a column of percentages reads at a glance. Hidden while
  // editing so it never fights the caret.
  const percentBar =
    field.format === 'percent' && isNumericValue && !editing
      ? Math.max(0, Math.min(100, Number(localValue)))
      : null;

  const input = (
    <Input
      aria-label={field.name}
      value={displayValue}
      readOnly={!record.canEdit || readOnly}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        if (!record.canEdit || readOnly) return;
        setLocalValue(e.target.value);
      }}
      onBlur={handleBlur}
      className="flex h-full w-full cursor-pointer flex-row items-center gap-1 border-none p-0 text-sm focus-visible:cursor-text shadow-none"
    />
  );

  if (percentBar === null) {
    return input;
  }

  return (
    <div className="relative flex h-full w-full items-center">
      <div className="pointer-events-none absolute inset-x-0 bottom-0.5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${percentBar}%` }}
        />
      </div>
      {input}
    </div>
  );
};
