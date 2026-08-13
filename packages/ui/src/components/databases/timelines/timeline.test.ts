import { describe, expect, it } from 'vitest';

import { LocalRecordNode } from '@colanode/client/types';

import {
  barGeometry,
  buildTimelineBands,
  buildTimelineBars,
  buildTimelinePeriods,
  dayDiff,
  parseTimelineDate,
  PX_PER_DAY,
  startOfUtcWeek,
  timelineRange,
  TimelineScale,
} from './timeline';

const record = (
  id: string,
  fields: Record<string, string | undefined>
): LocalRecordNode =>
  ({
    id,
    type: 'record',
    fields: Object.fromEntries(
      Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, { type: 'date', value }])
    ),
  }) as unknown as LocalRecordNode;

describe('parseTimelineDate', () => {
  it('reads a bare date as UTC midnight of that same day', () => {
    const parsed = parseTimelineDate('2026-01-15');
    expect(parsed?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('truncates a full instant to its UTC day', () => {
    const parsed = parseTimelineDate('2026-01-15T22:30:00.000Z');
    expect(parsed?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('returns null for empty, missing and unparseable values', () => {
    expect(parseTimelineDate('')).toBeNull();
    expect(parseTimelineDate(undefined)).toBeNull();
    expect(parseTimelineDate(null)).toBeNull();
    expect(parseTimelineDate(42)).toBeNull();
    expect(parseTimelineDate('not a date')).toBeNull();
  });
});

describe('startOfUtcWeek', () => {
  it('anchors on Monday', () => {
    // 2026-01-15 is a Thursday.
    expect(startOfUtcWeek(new Date('2026-01-15T00:00:00Z')).toISOString()).toBe(
      '2026-01-12T00:00:00.000Z'
    );
  });

  it('puts Sunday in the week that already began', () => {
    // 2026-01-18 is a Sunday; its week started Monday the 12th, not the 19th.
    expect(startOfUtcWeek(new Date('2026-01-18T00:00:00Z')).toISOString()).toBe(
      '2026-01-12T00:00:00.000Z'
    );
  });
});

describe('buildTimelineBars', () => {
  const start = 'f_start';
  const end = 'f_end';

  it('spans start to end', () => {
    const [bar] = buildTimelineBars(
      [record('r1', { [start]: '2026-01-05', [end]: '2026-01-09' })],
      start,
      end
    );

    expect(bar?.start.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(bar?.end.toISOString()).toBe('2026-01-09T00:00:00.000Z');
    expect(bar?.isMilestone).toBe(false);
  });

  it('drops records with no start date', () => {
    const bars = buildTimelineBars(
      [
        record('r1', { [end]: '2026-01-09' }),
        record('r2', { [start]: '2026-01-05' }),
      ],
      start,
      end
    );

    expect(bars.map((bar) => bar.recordId)).toEqual(['r2']);
  });

  it('treats a missing end as a milestone at the start', () => {
    const [bar] = buildTimelineBars(
      [record('r1', { [start]: '2026-01-05' })],
      start,
      end
    );

    expect(bar?.isMilestone).toBe(true);
    expect(bar?.end.toISOString()).toBe(bar?.start.toISOString());
  });

  it('treats an end before the start as a milestone rather than a backwards bar', () => {
    const [bar] = buildTimelineBars(
      [record('r1', { [start]: '2026-01-09', [end]: '2026-01-05' })],
      start,
      end
    );

    expect(bar?.isMilestone).toBe(true);
    expect(bar?.end.toISOString()).toBe('2026-01-09T00:00:00.000Z');
  });

  it('returns nothing when no start field is configured', () => {
    expect(
      buildTimelineBars([record('r1', { [start]: '2026-01-05' })], null, end)
    ).toEqual([]);
  });
});

describe('timelineRange', () => {
  const bars = buildTimelineBars(
    [record('r1', { s: '2026-03-10', e: '2026-03-20' })],
    's',
    'e'
  );

  it('always contains today, even when every bar is far away', () => {
    const today = new Date('2026-06-01T00:00:00Z');
    const range = timelineRange(bars, 'day', today);

    expect(range.start.getTime()).toBeLessThanOrEqual(
      new Date('2026-03-10T00:00:00Z').getTime()
    );
    expect(range.end.getTime()).toBeGreaterThanOrEqual(today.getTime());
  });

  it('aligns to whole weeks at week scale', () => {
    const range = timelineRange(bars, 'week', new Date('2026-03-15T00:00:00Z'));

    expect(range.start.getUTCDay()).toBe(1);
    expect(range.end.getUTCDay()).toBe(0);
  });

  it('aligns to whole months at month scale', () => {
    const range = timelineRange(
      bars,
      'month',
      new Date('2026-03-15T00:00:00Z')
    );

    expect(range.start.getUTCDate()).toBe(1);
    // The last day of a month is the day before the first of the next.
    const dayAfter = new Date(range.end.getTime() + 24 * 60 * 60 * 1000);
    expect(dayAfter.getUTCDate()).toBe(1);
  });
});

describe('buildTimelinePeriods', () => {
  const range = {
    start: new Date('2026-01-01T00:00:00Z'),
    end: new Date('2026-03-31T00:00:00Z'),
  };

  it('covers exactly the range at day scale', () => {
    const periods = buildTimelinePeriods(range, 'day');

    expect(periods).toHaveLength(dayDiff(range.start, range.end) + 1);
    expect(periods[0]?.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(periods[periods.length - 1]?.start.toISOString()).toBe(
      '2026-03-31T00:00:00.000Z'
    );
  });

  it('gives every month its real length', () => {
    const periods = buildTimelinePeriods(range, 'month');

    expect(periods.map((period) => period.days)).toEqual([31, 28, 31]);
    expect(periods.map((period) => period.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
    ]);
  });

  it('counts February in a leap year as 29 days', () => {
    const periods = buildTimelinePeriods(
      {
        start: new Date('2028-02-01T00:00:00Z'),
        end: new Date('2028-02-29T00:00:00Z'),
      },
      'month'
    );

    expect(periods[0]?.days).toBe(29);
  });

  it('returns nothing when the range is inverted', () => {
    expect(
      buildTimelinePeriods(
        {
          start: new Date('2026-03-31T00:00:00Z'),
          end: new Date('2026-01-01T00:00:00Z'),
        },
        'day'
      )
    ).toEqual([]);
  });

  it.each(['day', 'week', 'month'] as TimelineScale[])(
    'spans the whole range in %s columns',
    (scale) => {
      const periods = buildTimelinePeriods(range, scale);
      const covered = periods.reduce((sum, period) => sum + period.days, 0);

      expect(covered).toBeGreaterThanOrEqual(
        dayDiff(range.start, range.end) + 1
      );
    }
  );
});

describe('buildTimelineBands', () => {
  it('merges the day columns of a month into one header cell', () => {
    const periods = buildTimelinePeriods(
      {
        start: new Date('2026-01-30T00:00:00Z'),
        end: new Date('2026-02-02T00:00:00Z'),
      },
      'day'
    );
    const bands = buildTimelineBands(periods);

    expect(bands.map((band) => [band.label, band.days])).toEqual([
      ['Jan 2026', 2],
      ['Feb 2026', 2],
    ]);
  });
});

describe('barGeometry', () => {
  const range = {
    start: new Date('2026-01-01T00:00:00Z'),
    end: new Date('2026-01-31T00:00:00Z'),
  };

  it('places a bar at its day offset and counts the end day', () => {
    const [bar] = buildTimelineBars(
      [record('r1', { s: '2026-01-03', e: '2026-01-05' })],
      's',
      'e'
    );
    const geometry = barGeometry(bar!, range, 'day');

    expect(geometry.left).toBe(2 * PX_PER_DAY.day);
    // 3rd, 4th, 5th: three days, not two.
    expect(geometry.width).toBe(3 * PX_PER_DAY.day);
  });

  it('keeps a single-day bar clickable at month scale', () => {
    const [bar] = buildTimelineBars(
      [record('r1', { s: '2026-01-03' })],
      's',
      'e'
    );

    expect(barGeometry(bar!, range, 'month').width).toBeGreaterThanOrEqual(8);
  });

  it('places a bar starting before the range at a negative offset', () => {
    const [bar] = buildTimelineBars(
      [record('r1', { s: '2025-12-30', e: '2026-01-02' })],
      's',
      'e'
    );

    expect(barGeometry(bar!, range, 'day').left).toBe(-2 * PX_PER_DAY.day);
  });
});
