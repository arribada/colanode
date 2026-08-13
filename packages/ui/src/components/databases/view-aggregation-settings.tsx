// ABOUTME: The "Aggregation" section of the view settings popover -- picks the
// ABOUTME: summary computed per column (count / sum / average / min / max).
//
// The choice is stored in the view's `summaries` record, which already existed
// and was already read by the table footer. The only way to reach it, though,
// was to click the footer strip under a table -- so on a board, a list or a
// gallery there was no aggregation at all, and on a table you had to know the
// footer was clickable. This exposes the same record from the settings
// popover, and the board column headers now read it too.

import { ChevronDown, Sigma } from 'lucide-react';

import { FieldAttributes, SpecialId } from '@colanode/core';
import { FieldIcon } from '@colanode/ui/components/databases/fields/field-icon';
import {
  COUNT_SUMMARIES,
  isNumericSummaryField,
  NUMERIC_SUMMARIES,
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
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

// Layouts that display a summary somewhere: the table in its footer strip, the
// board in each column header. The others list records without a place to put
// a total, so offering the choice there would set a value nothing renders.
const SUMMARY_LAYOUTS = ['table', 'board'];

export const supportsAggregation = (layout: string): boolean =>
  SUMMARY_LAYOUTS.includes(layout);

interface RowProps {
  label: string;
  field: FieldAttributes | null;
  kind: SummaryKind;
  canEdit: boolean;
  onChange: (kind: SummaryKind) => void;
}

const AggregationRow = ({
  label,
  field,
  kind,
  canEdit,
  onChange,
}: RowProps) => {
  const showNumeric = isNumericSummaryField(field);

  return (
    <div className="flex flex-row items-center gap-2">
      <FieldIcon
        type={field?.type}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={!canEdit}>
          <button
            type="button"
            disabled={!canEdit}
            className={cn(
              'flex shrink-0 cursor-pointer flex-row items-center gap-1 rounded-md px-1.5 py-0.5 text-xs',
              'text-muted-foreground hover:bg-accent hover:text-foreground',
              kind !== 'none' && 'text-foreground',
              !canEdit && 'pointer-events-none opacity-50'
            )}
          >
            {SUMMARY_LABELS[kind]}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={() => onChange('none')}>
            None
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {COUNT_SUMMARIES.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
          {showNumeric && (
            <>
              <DropdownMenuSeparator />
              {NUMERIC_SUMMARIES.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => onChange(option.value)}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export const ViewAggregationSettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const canEdit = database.canEdit && !database.isLocked;

  const setSummary = (fieldId: string, kind: SummaryKind) => {
    if (!canEdit) {
      return;
    }

    workspace.collections.nodes.update(view.id, (draft) => {
      if (draft.type !== 'database_view') {
        return;
      }

      const next = { ...(draft.summaries ?? {}) };
      // 'none' is the absence of a summary, not a summary called none --
      // storing it would leave dead keys behind on every column ever touched.
      if (kind === 'none') {
        delete next[fieldId];
      } else {
        next[fieldId] = kind;
      }

      draft.summaries = next;
    });
  };

  const kindOf = (fieldId: string): SummaryKind =>
    (view.summaries[fieldId] as SummaryKind | undefined) ?? 'none';

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex flex-row items-center gap-1.5">
        <Sigma className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Aggregation</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {view.layout === 'board'
          ? 'Shown in each column header.'
          : 'Shown in the footer under the table.'}
      </p>
      <div className="flex flex-col gap-1">
        <AggregationRow
          label="Name"
          field={null}
          kind={kindOf(SpecialId.Name)}
          canEdit={canEdit}
          onChange={(kind) => setSummary(SpecialId.Name, kind)}
        />
        {view.fields.map(({ field }) => (
          <AggregationRow
            key={field.id}
            label={field.name}
            field={field}
            kind={kindOf(field.id)}
            canEdit={canEdit}
            onChange={(kind) => setSummary(field.id, kind)}
          />
        ))}
      </div>
    </div>
  );
};
