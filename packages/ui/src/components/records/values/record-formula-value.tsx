// Read-only cell that evaluates a formula field for the current record and
// renders the computed value (or an error) per result type.

import { useMemo } from 'react';

import { evaluateFormulaField, formatFormulaValue } from '@colanode/client/lib';
import { FormulaFieldAttributes } from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useRecord } from '@colanode/ui/contexts/record';
import { cn } from '@colanode/ui/lib/utils';

interface RecordFormulaValueProps {
  field: FormulaFieldAttributes;
}

export const RecordFormulaValue = ({ field }: RecordFormulaValueProps) => {
  const database = useDatabase();
  const record = useRecord();

  const result = useMemo(
    () =>
      evaluateFormulaField(
        field,
        {
          fields: record.fields,
          name: record.name,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          createdBy: record.createdBy,
          updatedBy: record.updatedBy,
        },
        database.fields
      ),
    // record.localRevision changes whenever any field value changes, which is
    // what drives the formula to recompute when its dependencies update.
    [
      field,
      record.fields,
      record.localRevision,
      record.createdAt,
      record.updatedAt,
      database.fields,
    ]
  );

  if (result.error) {
    return (
      <p
        aria-label={field.name}
        className="text-sm text-red-500 line-clamp-1 w-full"
        title={result.error}
      >
        {result.error}
      </p>
    );
  }

  const text = formatFormulaValue(result.value);
  return (
    <p
      aria-label={field.name}
      className={cn(
        'text-sm line-clamp-1 w-full text-muted-foreground',
        typeof result.value === 'number' && 'tabular-nums'
      )}
      title={text}
    >
      {text}
    </p>
  );
};
