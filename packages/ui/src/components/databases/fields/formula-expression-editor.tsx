// Reusable editor for a formula field: an expression textarea, a field picker
// that inserts prop('Name') references, a searchable function palette, a
// result-type selector and live parse validation with dependency hints.

import { CheckCircle2, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import {
  FORMULA_FUNCTION_DOCS,
  FormulaFunctionCategory,
  FormulaFunctionDoc,
  getFormulaDependencies,
  validateFormula,
} from '@colanode/client/lib';
import { FieldAttributes, FormulaResultType } from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { Input } from '@colanode/ui/components/ui/input';
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

const CATEGORY_ORDER: FormulaFunctionCategory[] = [
  'Logic',
  'Text',
  'Math',
  'Date',
  'Convert',
];

export const FormulaExpressionEditor = ({
  expression,
  onExpressionChange,
  resultType,
  onResultTypeChange,
  fields,
}: FormulaExpressionEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [search, setSearch] = useState('');

  const error = useMemo(() => validateFormula(expression), [expression]);
  const dependencies = useMemo(
    () => (error ? [] : getFormulaDependencies(expression)),
    [expression, error]
  );

  // Insert a snippet at the caret. When the snippet contains an empty pair of
  // quotes or parentheses, the caret is dropped inside so the user can keep
  // typing arguments right away.
  const insertSnippet = (snippet: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? expression.length;
    const end = textarea?.selectionEnd ?? expression.length;

    const before = expression.slice(0, start);
    const after = expression.slice(end);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const prefix = needsSpace ? ' ' : '';
    const next = `${before}${prefix}${snippet}${after}`;
    onExpressionChange(next);

    // Position the caret inside the first empty () or ('') pair if present.
    const emptyPair = snippet.search(/\(''\)|\(\)/);
    const caret =
      emptyPair >= 0
        ? start +
          prefix.length +
          emptyPair +
          1 +
          (snippet.includes("('')") ? 1 : 0)
        : start + prefix.length + snippet.length;

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const insertField = (fieldId: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    insertSnippet(`prop('${field.name}')`);
  };

  const filteredDocs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query
      ? FORMULA_FUNCTION_DOCS.filter(
          (fn) =>
            fn.name.includes(query) ||
            fn.signature.toLowerCase().includes(query) ||
            fn.description.toLowerCase().includes(query)
        )
      : FORMULA_FUNCTION_DOCS;

    const grouped = new Map<FormulaFunctionCategory, FormulaFunctionDoc[]>();
    for (const fn of matches) {
      const list = grouped.get(fn.category) ?? [];
      list.push(fn);
      grouped.set(fn.category, list);
    }
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: grouped.get(category) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [search]);

  return (
    <div className="flex flex-col gap-2">
      <Label>Expression</Label>
      <Textarea
        ref={textareaRef}
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
            const isSelected = (option.value ?? null) === (resultType ?? null);
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

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Functions
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search functions…"
            className="h-8 text-xs"
            aria-label="Search formula functions"
          />
          <div className="max-h-56 overflow-y-auto pr-1">
            {filteredDocs.length === 0 ? (
              <p className="py-2 text-center text-muted-foreground">
                No matching function.
              </p>
            ) : (
              filteredDocs.map((group) => (
                <div key={group.category} className="mb-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.category}
                  </p>
                  <div className="flex flex-col">
                    {group.items.map((fn) => (
                      <button
                        key={fn.name}
                        type="button"
                        title={fn.description}
                        onClick={() => insertSnippet(fn.snippet)}
                        className="flex flex-col items-start gap-0.5 rounded-sm px-2 py-1 text-left hover:bg-accent"
                      >
                        <code className="font-mono text-foreground">
                          {fn.signature}
                        </code>
                        <span className="text-[11px] text-muted-foreground">
                          {fn.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </details>
    </div>
  );
};
