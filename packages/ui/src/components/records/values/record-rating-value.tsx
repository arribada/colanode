import { Star } from 'lucide-react';

import { NumberFieldValue, RatingFieldAttributes } from '@colanode/core';
import { useRecord } from '@colanode/ui/contexts/record';
import { useRecordField } from '@colanode/ui/hooks/use-record-field';
import { cn } from '@colanode/ui/lib/utils';

interface RecordRatingValueProps {
  field: RatingFieldAttributes;
  readOnly?: boolean;
}

export const RecordRatingValue = ({
  field,
  readOnly,
}: RecordRatingValueProps) => {
  const record = useRecord();
  const { value, setValue, clearValue } = useRecordField<NumberFieldValue>({
    field,
  });

  const max = field.max && field.max > 0 ? field.max : 5;
  const current =
    typeof value?.value === 'number' ? Math.round(value.value) : 0;
  const editable = record.canEdit && !readOnly;

  return (
    <div className="flex h-full w-full flex-row items-center gap-0.5 p-0">
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        const filled = star <= current;
        return (
          <button
            key={star}
            type="button"
            disabled={!editable}
            aria-label={`${star} / ${max}`}
            onClick={() => {
              if (!editable) return;
              // Clicking the current rating clears it; any other star sets it.
              if (star === current) {
                clearValue();
              } else {
                setValue({ type: 'number', value: star });
              }
            }}
            className={cn(
              'text-muted-foreground/30 transition-colors',
              filled && 'text-yellow-500',
              editable ? 'hover:text-yellow-500' : 'cursor-default'
            )}
          >
            <Star className={cn('size-4', filled && 'fill-current')} />
          </button>
        );
      })}
    </div>
  );
};
