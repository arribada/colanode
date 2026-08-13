// ABOUTME: The timeline body -- a date axis across the top, one row per record,
// ABOUTME: and a bar spanning each record's start and end dates.

import { useMemo } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes, SelectOptionAttributes } from '@colanode/core';
import {
  barGeometry,
  buildTimelineBands,
  buildTimelineBars,
  buildTimelinePeriods,
  dayDiff,
  PX_PER_DAY,
  startOfUtcDay,
  TimelineBar,
  timelineRange,
  TimelineScale,
} from '@colanode/ui/components/databases/timelines/timeline';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';
import { getSelectOptionLightColorClass } from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

// The frozen left column holding record names.
const NAME_WIDTH = 220;
const ROW_HEIGHT = 32;

// Enough to make a real project legible without turning a 5000-record database
// into a page that never finishes laying out. The count is shown when it bites.
const RECORD_LIMIT = 300;

interface TimelineRow {
  record: LocalRecordNode;
  bar: TimelineBar;
}

interface TimelineGroup {
  key: string;
  label: string;
  colorClass: string | null;
  rows: TimelineRow[];
}

const formatDay = (date: Date): string =>
  `${String(date.getUTCDate()).padStart(2, '0')}/${String(
    date.getUTCMonth() + 1
  ).padStart(2, '0')}/${date.getUTCFullYear()}`;

/** The select option a record sits under, for swimlanes. */
const groupValueOf = (
  record: LocalRecordNode,
  field: FieldAttributes | undefined
): string | null => {
  if (!field) {
    return null;
  }

  const value = record.fields[field.id]?.value;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  // multi_select holds an array; a record can sit in several columns on a
  // board, but a timeline row exists once, so it follows its first value.
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return null;
};

const optionsOf = (
  field: FieldAttributes | undefined
): Record<string, SelectOptionAttributes> => {
  if (
    field &&
    (field.type === 'select' || field.type === 'multi_select') &&
    field.options
  ) {
    return field.options;
  }

  return {};
};

export const TimelineViewChart = () => {
  const database = useDatabase();
  const view = useDatabaseView();

  const { data: records } = useRecordsQuery(
    view.filters,
    view.sorts,
    RECORD_LIMIT
  );

  const scale: TimelineScale = view.timeline?.scale ?? 'week';
  const startFieldId = view.timeline?.startFieldId ?? null;
  const endFieldId = view.timeline?.endFieldId ?? null;

  const groupField = database.fields.find((field) => field.id === view.groupBy);

  const bars = useMemo(
    () => buildTimelineBars(records, startFieldId, endFieldId),
    [records, startFieldId, endFieldId]
  );

  // `today` is read once per render rather than per row, so every row and the
  // marker line agree on the same "now".
  const today = useMemo(() => startOfUtcDay(new Date()), []);

  const range = useMemo(
    () => timelineRange(bars, scale, today),
    [bars, scale, today]
  );

  const periods = useMemo(
    () => buildTimelinePeriods(range, scale),
    [range, scale]
  );
  const bands = useMemo(() => buildTimelineBands(periods), [periods]);

  const pxPerDay = PX_PER_DAY[scale];
  const chartWidth = (dayDiff(range.start, range.end) + 1) * pxPerDay;

  const groups = useMemo<TimelineGroup[]>(() => {
    const byId = new Map(records.map((record) => [record.id, record]));
    const rows: TimelineRow[] = bars
      .map((bar) => {
        const record = byId.get(bar.recordId);
        return record ? { record, bar } : null;
      })
      .filter((row): row is TimelineRow => row !== null);

    if (!groupField) {
      return [{ key: 'all', label: '', colorClass: null, rows }];
    }

    const options = optionsOf(groupField);
    const buckets = new Map<string, TimelineRow[]>();
    for (const row of rows) {
      const key = groupValueOf(row.record, groupField) ?? '__none';
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(row);
      } else {
        buckets.set(key, [row]);
      }
    }

    // Option order, then the ungrouped bucket last -- the same reading order
    // the board gives its columns.
    const ordered: TimelineGroup[] = [];
    for (const option of Object.values(options)) {
      const bucketRows = buckets.get(option.id);
      if (!bucketRows) {
        continue;
      }
      ordered.push({
        key: option.id,
        label: option.name,
        colorClass: getSelectOptionLightColorClass(option.color ?? 'gray'),
        rows: bucketRows,
      });
      buckets.delete(option.id);
    }

    for (const [key, bucketRows] of buckets) {
      if (key === '__none') {
        continue;
      }
      ordered.push({ key, label: key, colorClass: null, rows: bucketRows });
    }

    const none = buckets.get('__none');
    if (none) {
      ordered.push({
        key: '__none',
        label: 'No value',
        colorClass: getSelectOptionLightColorClass('gray'),
        rows: none,
      });
    }

    return ordered;
  }, [records, bars, groupField]);

  const todayOffset = dayDiff(range.start, today) * pxPerDay;
  const todayVisible = todayOffset >= 0 && todayOffset <= chartWidth;

  if (bars.length === 0) {
    return (
      <div className="mt-2 flex w-full flex-col items-center justify-center gap-2 pt-20">
        <p className="text-sm text-muted-foreground">
          No record has a date in the start field yet.
        </p>
        <p className="text-xs text-muted-foreground">
          Records without a start date are not placed on the timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full min-w-full max-w-full overflow-auto pr-5">
      <div
        className="relative"
        style={{ width: NAME_WIDTH + chartWidth, minWidth: '100%' }}
      >
        <div className="sticky top-0 z-20 flex flex-row bg-background">
          <div
            className="sticky left-0 z-30 shrink-0 border-r border-b bg-background"
            style={{ width: NAME_WIDTH }}
          />
          <div className="shrink-0" style={{ width: chartWidth }}>
            <div className="flex flex-row border-b">
              {bands.map((band) => (
                <div
                  key={band.key}
                  className="shrink-0 truncate border-r px-1 py-0.5 text-xs font-medium text-muted-foreground"
                  style={{ width: band.days * pxPerDay }}
                >
                  {band.label}
                </div>
              ))}
            </div>
            <div className="flex flex-row border-b">
              {periods.map((period) => (
                <div
                  key={period.key}
                  className="shrink-0 truncate border-r px-1 py-0.5 text-center text-[10px] text-muted-foreground"
                  style={{ width: period.days * pxPerDay }}
                >
                  {period.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          {/* One gridline layer for the whole body rather than per row: at day
              scale a two-year range is 700 columns, and 700 lines per row is
              what turns a chart into a stutter. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-0"
            style={{ left: NAME_WIDTH, width: chartWidth }}
          >
            {periods.map((period) => (
              <div
                key={period.key}
                className="absolute inset-y-0 border-r border-border/40"
                style={{
                  left: dayDiff(range.start, period.start) * pxPerDay,
                  width: period.days * pxPerDay,
                }}
              />
            ))}
            {todayVisible && (
              <div
                className="absolute inset-y-0 z-10 w-px bg-red-500"
                style={{ left: todayOffset }}
                title="Today"
              />
            )}
          </div>

          {groups.map((group) => (
            <div key={group.key}>
              {groupField && (
                <div className="flex flex-row">
                  <div
                    className="sticky left-0 z-10 flex shrink-0 flex-row items-center gap-2 border-r bg-background px-2 py-1"
                    style={{ width: NAME_WIDTH }}
                  >
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        group.colorClass ?? 'bg-muted'
                      )}
                    />
                    <span className="truncate text-xs font-medium">
                      {group.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.rows.length}
                    </span>
                  </div>
                  <div
                    className="shrink-0 bg-muted/30"
                    style={{ width: chartWidth }}
                  />
                </div>
              )}
              {group.rows.map(({ record, bar }) => {
                const geometry = barGeometry(bar, range, scale);
                const name =
                  record.name && record.name !== '' ? record.name : 'Unnamed';

                return (
                  <div
                    key={record.id}
                    className="group/timeline-row flex flex-row border-b border-border/40"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div
                      className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-background px-2 group-hover/timeline-row:bg-accent"
                      style={{ width: NAME_WIDTH }}
                    >
                      <Link
                        from="/workspace/$userId/$nodeId"
                        to="modal/$modalNodeId"
                        params={{ modalNodeId: record.id }}
                        className="truncate text-sm hover:underline"
                        title={name}
                      >
                        {name}
                      </Link>
                    </div>
                    <div
                      className="relative shrink-0"
                      style={{ width: chartWidth }}
                    >
                      <Link
                        from="/workspace/$userId/$nodeId"
                        to="modal/$modalNodeId"
                        params={{ modalNodeId: record.id }}
                        data-testid={`timeline-bar-${record.id}`}
                        title={
                          bar.isMilestone
                            ? `${name} — ${formatDay(bar.start)}`
                            : `${name} — ${formatDay(bar.start)} → ${formatDay(bar.end)}`
                        }
                        className={cn(
                          'absolute top-1/2 z-10 flex -translate-y-1/2 items-center rounded-md border',
                          'hover:brightness-95',
                          group.colorClass ?? 'bg-blue-100 dark:bg-blue-900',
                          bar.isMilestone && 'rotate-45 rounded-sm'
                        )}
                        style={{
                          left: geometry.left,
                          width: bar.isMilestone ? 10 : geometry.width,
                          height: bar.isMilestone ? 10 : 16,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {records.length >= RECORD_LIMIT && (
          <p className="sticky left-0 py-2 text-xs text-muted-foreground">
            Showing the first {RECORD_LIMIT} records. Narrow the view with a
            filter to see the rest.
          </p>
        )}
      </div>
    </div>
  );
};
