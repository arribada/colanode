// ABOUTME: The timeline body -- a date axis across the top, one row per record,
// ABOUTME: and a bar spanning each record's start and end dates.

import { useEffect, useMemo, useRef } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes, SelectOptionAttributes } from '@colanode/core';
import {
  barColorClass,
  buildDependencyLinks,
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
import { TimelineViewBar } from '@colanode/ui/components/databases/timelines/timeline-view-bar';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';
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
  // Always a real class. Nullable here once meant "no fill", which is how bars
  // ended up invisible; the fallback belongs in barColorClass, not at the
  // point of use where it is easy to forget one branch.
  colorClass: string;
  rows: TimelineRow[];
}

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

  // When the view configures no separate end field, fall back to the start
  // date field's own range partner (its endFieldId attribute). A `date` field
  // that is itself a start+due range then draws as a span with no extra setup,
  // instead of collapsing to a milestone dot.
  const startField = startFieldId
    ? database.fields.find((field) => field.id === startFieldId)
    : undefined;
  const rangeEndFieldId =
    startField && startField.type === 'date' && startField.endFieldId
      ? startField.endFieldId
      : null;
  const endFieldId = view.timeline?.endFieldId ?? rangeEndFieldId;

  // The field objects the bar writes back to; passing them down keeps the
  // read-only test (created_at / updated_at) and drag logic in one place.
  const endField = endFieldId
    ? database.fields.find((field) => field.id === endFieldId)
    : undefined;

  // Dependency arrows read a self-relation field (target === this database).
  // A relation into another database would list unrelated records and is
  // ignored, so a stale/mis-set config draws nothing rather than nonsense.
  const dependencyFieldId = view.timeline?.dependencyFieldId ?? null;
  const dependencyField = dependencyFieldId
    ? database.fields.find(
        (field) =>
          field.id === dependencyFieldId &&
          field.type === 'relation' &&
          field.databaseId === database.id
      )
    : undefined;

  const groupField = database.fields.find((field) => field.id === view.groupBy);

  const bars = useMemo(
    () => buildTimelineBars(records, startFieldId, endFieldId, database.fields),
    [records, startFieldId, endFieldId, database.fields]
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
      return [{ key: 'all', label: '', colorClass: barColorClass(null), rows }];
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
        colorClass: barColorClass(option.color),
        rows: bucketRows,
      });
      buckets.delete(option.id);
    }

    for (const [key, bucketRows] of buckets) {
      if (key === '__none') {
        continue;
      }
      ordered.push({
        key,
        label: key,
        colorClass: barColorClass(null),
        rows: bucketRows,
      });
    }

    const none = buckets.get('__none');
    if (none) {
      ordered.push({
        key: '__none',
        label: 'No value',
        colorClass: barColorClass('gray'),
        rows: none,
      });
    }

    return ordered;
  }, [records, bars, groupField]);

  // Vertical centre of every record row, in chart-body pixels. Only built for
  // the flat layout: with swimlanes the group header rows are not a fixed
  // height, so a single row-index * ROW_HEIGHT mapping would drift. Arrows in
  // grouped views are deferred rather than drawn at the wrong Y.
  const rowCenterY = useMemo(() => {
    const map = new Map<string, number>();
    if (groupField || groups.length === 0) {
      return map;
    }
    const rows = groups[0]?.rows ?? [];
    rows.forEach((row, index) => {
      map.set(row.record.id, index * ROW_HEIGHT + ROW_HEIGHT / 2);
    });
    return map;
  }, [groups, groupField]);

  const dependencyLinks = useMemo(
    () =>
      dependencyField
        ? buildDependencyLinks(
            bars,
            records,
            dependencyField.id,
            range,
            scale,
            rowCenterY
          )
        : [],
    [dependencyField, bars, records, range, scale, rowCenterY]
  );

  // Start-only timelines collapse to a row of dots. If the user never set an
  // end field AND the database has another date field to use as one, surface a
  // one-line nudge in the body rather than leaving them to hunt the hover-only
  // End picker in the settings popover.
  const everyBarIsMilestone =
    bars.length > 0 && bars.every((bar) => bar.isMilestone);
  const hasAnotherDateField = database.fields.some(
    (field) => field.type === 'date' && field.id !== startFieldId
  );
  const showEndFieldHint =
    everyBarIsMilestone && !endFieldId && hasAnotherDateField;

  const todayOffset = dayDiff(range.start, today) * pxPerDay;
  const todayVisible = todayOffset >= 0 && todayOffset <= chartWidth;

  // Open on today rather than at scrollLeft 0. The range is padded out to
  // whichever record starts earliest, so a database holding two years of work
  // opens thousands of pixels away from anything current -- rows of names next
  // to an empty grid, which reads as "the bars are missing".
  const scrollerRef = useRef<HTMLDivElement>(null);
  const centredOn = useRef<string | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || chartWidth === 0) {
      return;
    }

    // Re-centre when the axis itself changes (scale, or new data extending the
    // range) but never afterwards, so it does not yank back a user who scrolled.
    const key = `${scale}:${range.start.toISOString()}:${chartWidth}`;
    if (centredOn.current === key) {
      return;
    }
    centredOn.current = key;

    // A third in, so what just finished and what is coming are both on screen.
    scroller.scrollLeft = Math.max(0, todayOffset - scroller.clientWidth / 3);
  }, [scale, chartWidth, todayOffset, range.start]);

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
    <div
      ref={scrollerRef}
      className="mt-2 w-full min-w-full max-w-full overflow-auto pr-5"
    >
      <div
        className="relative"
        style={{ width: NAME_WIDTH + chartWidth, minWidth: '100%' }}
      >
        {showEndFieldHint && (
          <div className="sticky left-0 z-20 mb-1 flex w-fit max-w-full items-center gap-1.5 rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
            <span>
              Every record shows as a dot. Pick an{' '}
              <span className="font-medium">End date</span> field in the view
              settings to draw bars from start to end.
            </span>
          </div>
        )}
        <div className="sticky top-0 z-30 flex flex-row bg-background">
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

          {dependencyLinks.length > 0 && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-0 overflow-visible"
              style={{ left: NAME_WIDTH, width: chartWidth }}
            >
              <defs>
                <marker
                  id="timeline-dep-arrow"
                  viewBox="0 0 8 8"
                  refX="6"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
                </marker>
              </defs>
              {dependencyLinks.map((link) => {
                // Elbow from the predecessor's end to the dependent's start:
                // out a little, across, then into the target. A small forward
                // stub keeps the arrow off the bar edge; when the dependent
                // starts before its predecessor ends (a scheduling overlap) the
                // path routes forward, down between the two rows, back, then in
                // -- so it never runs straight through the bars.
                const stub = 10;
                const straight = `M ${link.fromX} ${link.fromY} H ${link.fromX + stub} V ${link.toY} H ${link.toX}`;
                const around = `M ${link.fromX} ${link.fromY} H ${link.fromX + stub} V ${(link.fromY + link.toY) / 2} H ${link.toX - stub} V ${link.toY} H ${link.toX}`;
                return (
                  <path
                    key={link.key}
                    d={link.toX >= link.fromX + stub * 2 ? straight : around}
                    className="fill-none stroke-muted-foreground/70"
                    strokeWidth={1.5}
                    markerEnd="url(#timeline-dep-arrow)"
                  />
                );
              })}
            </svg>
          )}

          {groups.map((group) => (
            <div key={group.key}>
              {groupField && (
                <div className="flex flex-row">
                  <div
                    className="sticky left-0 z-20 flex shrink-0 flex-row items-center gap-2 border-r bg-background px-2 py-1"
                    style={{ width: NAME_WIDTH }}
                  >
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        group.colorClass
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
                const name =
                  record.name && record.name !== '' ? record.name : 'Unnamed';

                return (
                  <div
                    key={record.id}
                    className="group/timeline-row flex flex-row border-b border-border/40"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div
                      className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-background px-2 group-hover/timeline-row:bg-accent"
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
                      <TimelineViewBar
                        record={record}
                        bar={bar}
                        range={range}
                        scale={scale}
                        colorClass={group.colorClass}
                        startField={startField}
                        endField={endField}
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
