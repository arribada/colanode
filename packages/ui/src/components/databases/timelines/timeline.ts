// ABOUTME: Pure date maths for the timeline (Gantt) view -- parsing record
// ABOUTME: dates into bars, and slicing a range into day/week/month columns.
//
// Everything here works in UTC on purpose. A date field holds either a bare
// 'YYYY-MM-DD' or a full ISO instant; read with local getters, the first is
// shifted a day backwards for anyone west of Greenwich, which is exactly the
// off-by-one that makes a Gantt chart untrustworthy.

import { LocalRecordNode } from '@colanode/client/types';

export type TimelineScale = 'day' | 'week' | 'month';

export const DAY_MS = 24 * 60 * 60 * 1000;

// Column width per scale, in pixels per day. A day column is wide enough to
// label; a month column is ~150px for a 30-day month, which fits "January".
export const PX_PER_DAY: Record<TimelineScale, number> = {
  day: 34,
  week: 13,
  month: 5,
};

// Padding added around the data so the first and last bars are not flush
// against the edges of the chart.
const PAD_DAYS: Record<TimelineScale, number> = {
  day: 2,
  week: 7,
  month: 20,
};

// Bar fills, saturated on purpose.
//
// The obvious move was to reuse getSelectOptionLightColorClass, the helper the
// board tints its columns with. That was wrong twice over. Its classes are
// bg-*-50 washes, chosen to sit BEHIND a column at opacity-25 -- as a 16px bar
// on a white row, bg-blue-50 is white on white. And it returns '' for any
// colour outside its eight-value palette, which the workspace's own data
// exceeds ('brown', 'default'), so those bars had no fill class at all.
//
// Written as whole literal class names because Tailwind scans source text: a
// composed `bg-${color}-400` is never generated.
const BAR_COLORS: Record<string, string> = {
  gray: 'bg-gray-400 dark:bg-gray-500',
  orange: 'bg-orange-400 dark:bg-orange-500',
  yellow: 'bg-yellow-400 dark:bg-yellow-500',
  green: 'bg-green-400 dark:bg-green-500',
  blue: 'bg-blue-400 dark:bg-blue-500',
  purple: 'bg-purple-400 dark:bg-purple-500',
  pink: 'bg-pink-400 dark:bg-pink-500',
  red: 'bg-red-400 dark:bg-red-500',
  // Not in the select palette, but present in the data.
  brown: 'bg-amber-600 dark:bg-amber-700',
};

const BAR_FALLBACK = 'bg-sky-500 dark:bg-sky-600';

/** A visible fill for any colour, including ones the palette never had. */
export const barColorClass = (color: string | null | undefined): string =>
  (color ? BAR_COLORS[color] : undefined) ?? BAR_FALLBACK;

export interface TimelineRange {
  start: Date;
  end: Date;
}

export interface TimelineBar {
  recordId: string;
  start: Date;
  end: Date;
  // A record with a start but no end (or no end field at all) is a point in
  // time, drawn as a marker rather than a stretched bar of arbitrary length.
  isMilestone: boolean;
}

export interface TimelinePeriod {
  key: string;
  label: string;
  // Label of the band above (month, or year at month scale). Consecutive
  // periods sharing this value are merged into one cell by the header.
  band: string;
  start: Date;
  days: number;
}

/** UTC midnight of whatever the field holds, or null if it holds no date. */
export const parseTimelineDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
};

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY_MS);

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const dayDiff = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS);

export const startOfUtcDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

/** Monday of the week `date` falls in. */
export const startOfUtcWeek = (date: Date): Date => {
  const day = startOfUtcDay(date);
  // getUTCDay is 0 on Sunday, which belongs to the week that began 6 days ago.
  const weekday = (day.getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
};

export const startOfUtcMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

/**
 * One bar per record that has a usable start date. Records without one are
 * dropped -- they have no position on a time axis, and inventing one (today,
 * say) would draw work that was never scheduled.
 */
export const buildTimelineBars = (
  records: LocalRecordNode[],
  startFieldId: string | null | undefined,
  endFieldId: string | null | undefined
): TimelineBar[] => {
  if (!startFieldId) {
    return [];
  }

  const bars: TimelineBar[] = [];
  for (const record of records) {
    const start = parseTimelineDate(record.fields[startFieldId]?.value);
    if (!start) {
      continue;
    }

    const rawEnd = endFieldId
      ? parseTimelineDate(record.fields[endFieldId]?.value)
      : null;

    // An end before the start is a data error, not a backwards bar: treat it
    // as if the end were missing so the record still shows at its start date.
    const end = rawEnd && rawEnd.getTime() >= start.getTime() ? rawEnd : null;

    bars.push({
      recordId: record.id,
      start,
      end: end ?? start,
      isMilestone: end === null,
    });
  }

  return bars;
};

/**
 * The window the chart spans: everything the bars cover, plus today so the
 * "now" marker is always on screen, plus a little padding.
 */
export const timelineRange = (
  bars: TimelineBar[],
  scale: TimelineScale,
  today: Date
): TimelineRange => {
  const anchor = startOfUtcDay(today);
  let min = anchor;
  let max = anchor;

  for (const bar of bars) {
    if (bar.start.getTime() < min.getTime()) {
      min = bar.start;
    }
    if (bar.end.getTime() > max.getTime()) {
      max = bar.end;
    }
  }

  const pad = PAD_DAYS[scale];
  const paddedStart = addDays(min, -pad);
  const paddedEnd = addDays(max, pad);

  // Align to whole periods so every column is full width and the grid lines
  // fall on real boundaries rather than wherever the data happened to start.
  if (scale === 'week') {
    return {
      start: startOfUtcWeek(paddedStart),
      end: addDays(startOfUtcWeek(paddedEnd), 6),
    };
  }

  if (scale === 'month') {
    const start = startOfUtcMonth(paddedStart);
    const endMonth = startOfUtcMonth(paddedEnd);
    const end = addDays(
      new Date(
        Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() + 1, 1)
      ),
      -1
    );
    return { start, end };
  }

  return { start: paddedStart, end: paddedEnd };
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const monthBand = (date: Date): string =>
  `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

/** The columns of the axis, left to right, covering the whole range. */
export const buildTimelinePeriods = (
  range: TimelineRange,
  scale: TimelineScale
): TimelinePeriod[] => {
  const periods: TimelinePeriod[] = [];
  const totalDays = dayDiff(range.start, range.end) + 1;
  if (totalDays <= 0) {
    return periods;
  }

  if (scale === 'day') {
    for (let offset = 0; offset < totalDays; offset++) {
      const start = addDays(range.start, offset);
      periods.push({
        key: start.toISOString(),
        label: String(start.getUTCDate()),
        band: monthBand(start),
        start,
        days: 1,
      });
    }
    return periods;
  }

  if (scale === 'week') {
    let cursor = startOfUtcWeek(range.start);
    while (cursor.getTime() <= range.end.getTime()) {
      periods.push({
        key: cursor.toISOString(),
        label: `${cursor.getUTCDate()}`,
        band: monthBand(cursor),
        start: cursor,
        days: 7,
      });
      cursor = addDays(cursor, 7);
    }
    return periods;
  }

  let cursor = startOfUtcMonth(range.start);
  while (cursor.getTime() <= range.end.getTime()) {
    const next = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
    );
    periods.push({
      key: cursor.toISOString(),
      label: MONTHS[cursor.getUTCMonth()] ?? '',
      band: String(cursor.getUTCFullYear()),
      start: cursor,
      days: dayDiff(cursor, next),
    });
    cursor = next;
  }

  return periods;
};

/** Consecutive periods sharing a band, merged into the header's upper row. */
export const buildTimelineBands = (
  periods: TimelinePeriod[]
): { key: string; label: string; days: number }[] => {
  const bands: { key: string; label: string; days: number }[] = [];

  for (const period of periods) {
    const last = bands[bands.length - 1];
    if (last && last.label === period.band) {
      last.days += period.days;
      continue;
    }

    bands.push({ key: period.key, label: period.band, days: period.days });
  }

  return bands;
};

/** Left offset and width of a bar, in pixels, within the chart body. */
export const barGeometry = (
  bar: TimelineBar,
  range: TimelineRange,
  scale: TimelineScale
): { left: number; width: number } => {
  const pxPerDay = PX_PER_DAY[scale];
  const left = dayDiff(range.start, bar.start) * pxPerDay;
  // Inclusive of the end day: a task from the 3rd to the 3rd lasts one day.
  const span = dayDiff(bar.start, bar.end) + 1;

  return {
    left,
    // A one-day bar at month scale would be 5px wide and invisible, so every
    // bar keeps a floor that stays clickable.
    width: Math.max(span * pxPerDay, 8),
  };
};
