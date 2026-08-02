// ABOUTME: Body of the database chart view — loads all filtered records, runs
// ABOUTME: the aggregation and renders the chosen SVG chart with a legend.
import { ChartPie } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { DatabaseViewChartAggregate } from '@colanode/core';
import {
  aggregateRecords,
  resolveGroupField,
} from '@colanode/ui/components/databases/charts/chart-aggregation';
import { ChartColorPicker } from '@colanode/ui/components/databases/charts/chart-color-picker';
import {
  BarChartGraphic,
  LineChartGraphic,
  PieChartGraphic,
} from '@colanode/ui/components/databases/charts/chart-graphics';
import { EmptyDatabaseState } from '@colanode/ui/components/databases/empty-database-state';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';

export const ChartViewBody = () => {
  const database = useDatabase();
  const view = useDatabaseView();
  const workspace = useWorkspace();
  const canEdit = database.canEdit && !database.isLocked;

  // Colours live on the view, so a chart looks the same for everyone who opens
  // it — the same rule as every other view setting here.
  const setBucketColor = (key: string, color: string | null) => {
    if (!canEdit) {
      return;
    }

    workspace.collections.nodes.update(view.id, (draft) => {
      if (draft.type !== 'database_view') {
        return;
      }

      const current = draft.chart ?? { type: 'bar' };
      const colors = { ...(current.colors ?? {}) };
      if (color) {
        colors[key] = color;
      } else {
        delete colors[key];
      }
      draft.chart = { ...current, type: current.type ?? 'bar', colors };
    });
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(view.filters, view.sorts, 200);

  // A chart summarizes the whole result set, so pull every page. The query is
  // live, so edits/filter changes re-run this automatically.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const chart = view.chart;
  const chartType = chart?.type ?? 'bar';
  const aggregate: DatabaseViewChartAggregate = chart?.aggregate ?? 'count';
  const valueFieldId = chart?.valueFieldId ?? null;

  const groupField = useMemo(
    () => resolveGroupField(chart?.groupBy, database.fields),
    [chart?.groupBy, database.fields]
  );

  const valueField = useMemo(
    () => database.fields.find((field) => field.id === valueFieldId) ?? null,
    [database.fields, valueFieldId]
  );

  const buckets = useMemo(
    () =>
      aggregateRecords({
        records: data,
        field: groupField,
        aggregate,
        valueFieldId,
        chartType,
        colorOverrides: chart?.colors,
      }),
    [data, groupField, aggregate, valueFieldId, chartType, chart?.colors]
  );

  const hasGroupBy = chart?.groupBy != null && chart.groupBy !== '';

  const formatValue = (value: number): string => {
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const aggregateLabel =
    aggregate === 'count'
      ? 'Count of records'
      : aggregate === 'sum'
        ? `Sum of ${valueField?.name ?? 'value'}`
        : `Average of ${valueField?.name ?? 'value'}`;

  if (!hasGroupBy) {
    return (
      <div className="flex h-full min-h-64 w-full flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <ChartPie className="size-8" />
        <p className="font-medium">Configure this chart</p>
        <p>
          Open the chart settings and pick a field to group by to start
          visualizing your records.
        </p>
      </div>
    );
  }

  if (buckets.length === 0) {
    return <EmptyDatabaseState className="h-full min-h-64" />;
  }

  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <p className="text-sm font-medium text-muted-foreground">
        {aggregateLabel}
      </p>
      <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center">
        <div className="flex w-full items-center justify-center lg:w-auto">
          {chartType === 'pie' && (
            <PieChartGraphic buckets={buckets} formatValue={formatValue} />
          )}
          {chartType === 'bar' && (
            <BarChartGraphic buckets={buckets} formatValue={formatValue} />
          )}
          {chartType === 'line' && (
            <LineChartGraphic buckets={buckets} formatValue={formatValue} />
          )}
        </div>
        <div className="flex w-full max-w-sm flex-col gap-1.5">
          {buckets.map((bucket) => {
            const percent = total > 0 ? (bucket.value / total) * 100 : 0;
            return (
              <div
                key={bucket.key}
                className="flex flex-row items-center gap-2 text-sm"
              >
                <ChartColorPicker
                  label={bucket.label}
                  color={bucket.color}
                  isCustom={chart?.colors?.[bucket.key] != null}
                  readOnly={!canEdit}
                  onPick={(color) => setBucketColor(bucket.key, color)}
                  onReset={() => setBucketColor(bucket.key, null)}
                />
                <span className="truncate text-foreground">{bucket.label}</span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                  {formatValue(bucket.value)}
                  {aggregate === 'count' && (
                    <span className="ml-1 text-xs">
                      ({percent.toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
