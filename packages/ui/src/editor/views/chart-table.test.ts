import { describe, expect, it } from 'vitest';

import {
  axisLabels,
  buildTableChart,
  formatChartValue,
  niceTicks,
  parseChartNumber,
  resolveColumn,
  sharedStyle,
  suggestTableChart,
  valueDomain,
} from '@colanode/ui/editor/views/chart-table';

// The "Case 20 per product" table of the Financial projection page.
const CASE_20 = [
  [
    'Year',
    'Units',
    'Production spend',
    'Revenue',
    'Gross margin',
    'Margin per month',
  ],
  ['2027', '70', '£15k', '£37k', '£22k', '£1.8k'],
  ['2028', '110', '£22k', '£57k', '£34k', '£2.9k'],
  ['2029', '138', '£27k', '£71k', '£44k', '£3.7k'],
  ['2030', '172', '£33k', '£88k', '£55k', '£4.6k'],
  ['2033', '336', '£58k', '£173k', '£115k', '£9.5k'],
];

describe('parseChartNumber', () => {
  it('reads currency with compact units', () => {
    expect(parseChartNumber('£15k')).toEqual({
      value: 15_000,
      prefix: '£',
      percent: false,
      compact: true,
    });
    expect(parseChartNumber('£1,104k')?.value).toBe(1_104_000);
    expect(parseChartNumber('£1.8k')?.value).toBe(1_800);
    expect(parseChartNumber('$2.5M')?.value).toBe(2_500_000);
    expect(parseChartNumber('€1.2bn')?.value).toBe(1_200_000_000);
  });

  it('reads grouping, percentages and negatives', () => {
    expect(parseChartNumber('1,074')?.value).toBe(1074);
    expect(parseChartNumber('18 %')).toMatchObject({
      value: 18,
      percent: true,
    });
    expect(parseChartNumber('-£3k')?.value).toBe(-3000);
    expect(parseChartNumber('(1,200)')?.value).toBe(-1200);
    expect(parseChartNumber('£0')?.value).toBe(0);
  });

  it('leaves text alone', () => {
    expect(parseChartNumber('')).toBeNull();
    expect(parseChartNumber('Avian 40 g')).toBeNull();
    expect(parseChartNumber('2033: 100 % and above')).toBeNull();
    expect(parseChartNumber('k')).toBeNull();
    expect(parseChartNumber('about £1,000')).toBeNull();
  });
});

describe('formatChartValue', () => {
  const money = { prefix: '£', percent: false, compact: true };

  it('writes values the way the column writes them', () => {
    expect(formatChartValue(15_000, money)).toBe('£15k');
    expect(formatChartValue(1_800, money)).toBe('£1.8k');
    expect(formatChartValue(1_104_000, money)).toBe('£1.1M');
    expect(formatChartValue(-3_000, money)).toBe('-£3k');
    expect(formatChartValue(0, money)).toBe('£0');
    expect(
      formatChartValue(1074, { prefix: '', percent: false, compact: false })
    ).toBe('1,074');
    expect(
      formatChartValue(18, { prefix: '', percent: true, compact: false })
    ).toBe('18 %');
  });
});

describe('suggestTableChart', () => {
  it('puts the years across and every numeric column as a line', () => {
    const suggestion = suggestTableChart(CASE_20);
    expect(suggestion.chartType).toBe('line');
    expect(suggestion.xColumn).toEqual({ index: 0, name: 'Year' });
    expect(suggestion.series.map((s) => s.name)).toEqual([
      'Units',
      'Production spend',
      'Revenue',
      'Gross margin',
      'Margin per month',
    ]);
  });

  it('takes the text column across and suggests bars for unordered labels', () => {
    const suggestion = suggestTableChart([
      ['Product', 'Cost at 50', 'Market reference'],
      ['Avian 40 g', '£170', 'Microwave Telemetry about $3,950'],
      ['Turtle GPS', '£181', 'Wildlife Computers'],
      ['Boat LoRa', '£188', 'no packaged equivalent'],
    ]);
    expect(suggestion.chartType).toBe('bar');
    expect(suggestion.xColumn?.name).toBe('Product');
    expect(suggestion.series.map((s) => s.name)).toEqual(['Cost at 50']);
  });
});

describe('resolveColumn', () => {
  const names = ['Year', 'Revenue', 'Gross margin'];

  it('follows a column by its header when it moves', () => {
    expect(
      resolveColumn(['Revenue', 'Year', 'Gross margin'], {
        index: 1,
        name: 'Revenue',
      })
    ).toBe(0);
  });

  it('falls back to the position when the header was renamed', () => {
    expect(resolveColumn(names, { index: 1, name: 'Sales' })).toBe(1);
    expect(resolveColumn(names, { index: 7, name: 'Sales' })).toBeNull();
  });
});

describe('buildTableChart', () => {
  it('builds one series per chosen column, in pounds', () => {
    const data = buildTableChart(CASE_20, {
      headerRow: true,
      xColumn: { index: 0, name: 'Year' },
      series: [
        { index: 3, name: 'Revenue' },
        { index: 4, name: 'Gross margin', color: '#ff0000' },
      ],
    });
    expect(data.categories).toEqual(['2027', '2028', '2029', '2030', '2033']);
    expect(data.series.map((s) => s.name)).toEqual(['Revenue', 'Gross margin']);
    expect(data.series[0]?.values).toEqual([
      37_000, 57_000, 71_000, 88_000, 173_000,
    ]);
    expect(data.series[1]?.color).toBe('#ff0000');
    expect(data.style).toEqual({ prefix: '£', percent: false, compact: true });
  });

  it('leaves a gap for a cell that is not a number and skips empty rows', () => {
    const data = buildTableChart(
      [
        ['Year', 'Value'],
        ['2027', '10'],
        ['2028', 'n/a'],
        ['', ''],
        ['2029', '30'],
      ],
      {
        headerRow: true,
        xColumn: { index: 0, name: 'Year' },
        series: [{ index: 1, name: 'Value' }],
      }
    );
    expect(data.categories).toEqual(['2027', '2028', '2029']);
    expect(data.series[0]?.values).toEqual([10, null, 30]);
  });

  it('never plots the x column against itself, and keeps palette slots', () => {
    const data = buildTableChart(CASE_20, {
      headerRow: true,
      xColumn: { index: 0, name: 'Year' },
      series: [
        { index: 0, name: 'Year' },
        { index: 1, name: 'Units' },
      ],
    });
    expect(data.series.map((s) => [s.name, s.slot])).toEqual([['Units', 0]]);
  });

  it('gives a series the same colour slot whatever else is plotted', () => {
    const config = {
      headerRow: true,
      xColumn: { index: 0, name: 'Year' },
    };
    const alone = buildTableChart(CASE_20, {
      ...config,
      series: [{ index: 4, name: 'Gross margin' }],
    });
    const withOthers = buildTableChart(CASE_20, {
      ...config,
      series: [
        { index: 1, name: 'Units' },
        { index: 4, name: 'Gross margin' },
      ],
    });
    expect(alone.series[0]?.slot).toBe(3);
    expect(withOthers.series[1]?.slot).toBe(3);
  });
});

describe('niceTicks', () => {
  it('rounds the axis to clean steps that cover the data', () => {
    expect(niceTicks(0, 173_000)).toEqual([
      0, 50_000, 100_000, 150_000, 200_000,
    ]);
    expect(niceTicks(-3, 9)).toEqual([-5, 0, 5, 10]);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });
});

describe('valueDomain', () => {
  const data = buildTableChart(CASE_20, {
    headerRow: true,
    xColumn: { index: 0, name: 'Year' },
    series: [
      { index: 2, name: 'Production spend' },
      { index: 3, name: 'Revenue' },
    ],
  });

  it('stacks the series for a stacked chart', () => {
    expect(valueDomain(data, 'stacked', true)).toEqual([0, 58_000 + 173_000]);
  });

  it('lets a line start at its data only when asked', () => {
    expect(valueDomain(data, 'line', false)).toEqual([15_000, 173_000]);
    expect(valueDomain(data, 'line', true)).toEqual([0, 173_000]);
    expect(valueDomain(data, 'bar', false)).toEqual([0, 173_000]);
  });
});

describe('axis labels', () => {
  it('writes every tick in the same notation', () => {
    const units = { prefix: '', percent: false, compact: false };
    expect(axisLabels([0, 50_000, 100_000, 150_000], units)).toEqual([
      '0',
      '50k',
      '100k',
      '150k',
    ]);
    expect(axisLabels([0, 100, 200], units)).toEqual(['0', '100', '200']);
  });

  it('keeps a currency only when every series is in it', () => {
    const pounds = { prefix: '\u00a3', percent: false, compact: true };
    const units = { prefix: '', percent: false, compact: false };
    expect(sharedStyle([pounds, pounds])).toEqual(pounds);
    expect(sharedStyle([units, pounds])).toEqual({
      prefix: '',
      percent: false,
      compact: true,
    });
  });
});
