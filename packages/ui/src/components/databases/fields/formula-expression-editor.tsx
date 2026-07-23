// Reusable editor for a formula field: an expression textarea, a field picker
// that inserts prop('Name') references, a result-type selector and live
// parse validation with dependency hints.

import { CheckCircle2, XCircle } from 'lucide-react';
import { useMemo } from 'react';

import { getFormulaDependencies, validateFormula } from '@colanode/client/lib';
import { FieldAttributes, FormulaResultType } from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { Label } from '@colanode/ui/components/ui/label';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { cn } from '@colanode/ui/lib/utils';

interface FormulaExpressionEditorProps {
  expression: string;
  onExpressionChange: (value: string) => void;
  resultType: FormulaResultType | null;
  onResultTypeChange: (value: FormulaResultType | null) => void;
  fields: FieldAttributes[];
}

const RESULT_TYPES: { label: string; value: FormulaResultType | null }[] = [
  { label: 'Auto', value: null },
  { label: 'Number', value: 'number' },
  { label: 'Text', value: 'string' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
];

export const FormulaExpressionEditor = ({
  expression,
  onExpressionChange,
  resultType,
  onResultTypeChange,
  fields,
}: FormulaExpressionEditorProps) => {
  const error = useMemo(() => validateFormula(expression), [expression]);
  const dependencies = useMemo(
    () => (error ? [] : getFormulaDependencies(expression)),
    [expression, error]
  );

  const insertField = (fieldId: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    const snippet = `prop('${field.name}')`;
    const next = expression.length > 0 ? `${expression} ${snippet}` : snippet;
    onExpressionChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Expression</Label>
      <Textarea
        aria-label="Formula expression"
        data-testid="formula-expression-input"
        value={expression}
        onChange={(event) => onExpressionChange(event.target.value)}
        placeholder="prop('Price') * prop('Quantity')"
        className="font-mono text-sm min-h-24"
      />

      <div className="flex flex-row items-center gap-2">
        <span className="text-xs text-muted-foreground">Insert field:</span>
        <div className="flex-1">
          <FieldSelect fields={fields} value={null} onChange={insertField} />
        </div>
      </div>

      {expression.trim().length > 0 && (
        <div
          className={cn(
            'flex flex-row items-start gap-1 text-xs',
            error ? 'text-red-500' : 'text-green-600'
          )}
        >
          {error ? (
            <XCircle className="size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0" />
          )}
          <span>{error ? error : 'Valid expression'}</span>
        </div>
      )}

      {dependencies.length > 0 && (
        <p className="text-xs text-muted-foreground">
          References: {dependencies.join(', ')}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Result type</Label>
        <div className="flex flex-row flex-wrap gap-1">
          {RESULT_TYPES.map((option) => {
            const isSelected =
              (option.value ?? null) === (resultType ?? null);
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => onResultTypeChange(option.value)}
                className={cn(
                  'rounded-sm border px-2 py-1 text-xs',
                  isSelected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-input text-muted-foreground hover:bg-accent'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Functions</summary>
        <p className="mt-1 leading-relaxed">
          Arithmetic + - * / %, comparisons, if(cond, a, b), and/or/not, concat,
          upper, lower, length, slice, round, floor, ceil, abs, min, max, now,
          dateAdd(date, n, unit), dateDiff(a, b, unit), formatDate(date, fmt),
          prop('Field').
        </p>
      </details>
    </div>
  );
};
