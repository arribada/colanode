// ABOUTME: A single column footer cell in the table summary row — a dropdown to
// ABOUTME: pick an aggregation and the live-computed value for that column.
import { ChevronDown } from 'lucide-react';
import { Fragment } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes } from '@colanode/core';
import {
  computeSummaryValue,
  COUNT_SUMMARIES,
  isNumericSummaryField,
  NUMERIC_SUMMARIES,
  NUMERIC_SUMMARY_KINDS,
  SUMMARY_LABELS,
  SummaryKind,
} from '@colanode/ui/components/databases/tables/table-view-summary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { formatNumber, isNumericFormat } from '@colanode/ui/lib/number-format';
import { cn } from '@colanode/ui/lib/utils';

interface TableViewSummaryCellProps {
  field: FieldAttributes | null;
  records: LocalRecordNode[];
  kind: SummaryKind;
  canEdit: boolean;
  capped?: boolean;
  onChange: (kind: SummaryKind) => void;
}

export const TableViewSummaryCell = ({
  field,
  records,
  kind,
  canEdit,
  capped,
  onChange,
}: TableViewSummaryCellProps) => {
  const showNumeric = isNumericSummaryField(field);
  const value = computeSummaryValue(records, field, kind);

  // A number column's chosen format drives how its numeric summaries render, so
  // a Sum of a currency column reads as currency too.
  const numberFormat =
    field && field.type === 'number' ? field.format : undefined;

  const isNumeric = NUMERIC_SUMMARY_KINDS.includes(kind);

  let text = '';
  if (kind !== 'none' && value !== null) {
    if (isNumeric) {
      text = isNumericFormat(numberFormat)
        ? formatNumber(value, numberFormat)
        : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } else {
      text = value.toLocaleString();
    }
  } else if (kind !== 'none') {
    text = '—';
  }

  const content = (
    <span
      className={cn(
        'flex h-full w-full items-center gap-1 px-1 text-xs text-muted-foreground',
        isNumeric ? 'justify-end' : 'justify-start',
        kind === 'none' && 'opacity-0 group-hover/summary:opacity-100'
      )}
    >
      {kind === 'none' ? (
        <Fragment>
          <span>Calculate</span>
          <ChevronDown className="size-3" />
        </Fragment>
      ) : (
        <Fragment>
          <span className="truncate opacity-70">{SUMMARY_LABELS[kind]}</span>
          <span
            className="truncate font-medium tabular-nums text-foreground"
            title={
              capped
                ? 'Approximate — based on the first 5,000 records'
                : undefined
            }
          >
            {capped && value !== null ? '≈ ' : ''}
            {text}
          </span>
        </Fragment>
      )}
    </span>
  );

  // Read-only viewers still see a configured summary, but get no menu.
  if (!canEdit) {
    return kind === 'none' ? null : content;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Column summary"
          className="flex h-full w-full cursor-pointer items-center hover:bg-accent"
        >
          {content}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onChange('none')}>
          <span className={cn(kind === 'none' && 'font-medium')}>None</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {COUNT_SUMMARIES.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
          >
            <span className={cn(kind === option.value && 'font-medium')}>
              {option.label}
            </span>
          </DropdownMenuItem>
        ))}
        {showNumeric && (
          <Fragment>
            <DropdownMenuSeparator />
            {NUMERIC_SUMMARIES.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => onChange(option.value)}
              >
                <span className={cn(kind === option.value && 'font-medium')}>
                  {option.label}
                </span>
              </DropdownMenuItem>
            ))}
          </Fragment>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
