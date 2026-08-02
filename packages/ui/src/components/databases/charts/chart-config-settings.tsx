// ABOUTME: Chart-specific settings block (type, group-by, aggregate, value
// ABOUTME: field) rendered inside the shared view settings popover as its slot.
import { ChartColumnBig, ChartLine, ChartPie } from 'lucide-react';
import { FC } from 'react';

import {
  DatabaseViewChartAggregate,
  DatabaseViewChartAttributes,
  DatabaseViewChartType,
} from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

const chartTypes: { value: DatabaseViewChartType; label: string; icon: FC }[] = [
  { value: 'bar', label: 'Bar', icon: ChartColumnBig },
  { value: 'pie', label: 'Pie', icon: ChartPie },
  { value: 'line', label: 'Line', icon: ChartLine },
];

const aggregates: { value: DatabaseViewChartAggregate; label: string }[] = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
];

export const ChartConfigSettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const canEdit = database.canEdit && !database.isLocked;
  const chart = view.chart;
  const chartType = chart?.type ?? 'bar';
  const aggregate = chart?.aggregate ?? 'count';

  const numberFields = database.fields.filter(
    (field) => field.type === 'number'
  );

  const updateChart = (patch: Partial<DatabaseViewChartAttributes>) => {
    if (!canEdit) {
      return;
    }

    workspace.collections.nodes.update(view.id, (draft) => {
      if (draft.type !== 'database_view') {
        return;
      }

      const current = draft.chart ?? { type: 'bar' };
      draft.chart = {
        ...current,
        ...patch,
        type: patch.type ?? current.type ?? 'bar',
      };
    });
  };

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Chart type</p>
        <div className="grid grid-cols-3 gap-2">
          {chartTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              disabled={!canEdit}
              onClick={() => updateChart({ type: type.value })}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-muted-foreground',
                'hover:bg-accent',
                chartType === type.value
                  ? 'border-foreground text-foreground'
                  : ''
              )}
            >
              <type.icon />
              <span className="text-xs">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Group by</p>
        <div
          aria-disabled={!canEdit}
          className={cn(!canEdit && 'pointer-events-none opacity-50')}
        >
          <FieldSelect
            fields={database.fields}
            value={chart?.groupBy ?? null}
            onChange={(fieldId) => updateChart({ groupBy: fieldId })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Aggregate</p>
        <div className="grid grid-cols-3 gap-2">
          {aggregates.map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={!canEdit}
              onClick={() => updateChart({ aggregate: item.value })}
              className={cn(
                'cursor-pointer rounded-md border p-1.5 text-xs text-muted-foreground',
                'hover:bg-accent',
                aggregate === item.value
                  ? 'border-foreground text-foreground'
                  : ''
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {aggregate !== 'count' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Value field</p>
          {numberFields.length > 0 ? (
            <div
              aria-disabled={!canEdit}
              className={cn(!canEdit && 'pointer-events-none opacity-50')}
            >
              <FieldSelect
                fields={numberFields}
                value={chart?.valueFieldId ?? null}
                onChange={(fieldId) => updateChart({ valueFieldId: fieldId })}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add a number field to use sum or average.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
