// ABOUTME: Pure logic of a chart drawn from an editor table — reads the table into
// ABOUTME: a grid, parses "£1,104k" / "18 %" cells, picks axes, builds the series.
import { type Node as PMNode } from '@tiptap/pm/model';
import { TableMap } from '@tiptap/pm/tables';

import { parseNumberLoose } from '@colanode/ui/editor/views/table-sort';

export type TableChartType = 'bar' | 'stacked' | 'line' | 'area' | 'pie';

export const TABLE_CHART_TYPES: TableChartType[] = [
  'bar',
  'stacked',
  'line',
  'area',
  'pie',
];

// A column is remembered by its header text and its position: the name wins so
// inserting or moving a column keeps the chart on the same data, the position
// is the fallback when a header is renamed.
export interface ChartColumnRef {
  index: number;
  name: string;
}

export interface ChartSeriesRef extends ChartColumnRef {
  color?: string | null;
}

export interface TableChartConfig {
  xColumn: ChartColumnRef | null;
  series: ChartSeriesRef[];
  headerRow: boolean;
}

export interface ChartNumber {
  value: number;
  prefix: string;
  percent: boolean;
  compact: boolean;
}

export interface ChartValueStyle {
  prefix: string;
  percent: boolean;
  compact: boolean;
}

export interface TableChartSeries {
  key: string;
  name: string;
  // Position in the categorical palette, fixed by the column, so a series
  // keeps its colour while others are added or removed around it.
  slot: number;
  color: string | null;
  values: (number | null)[];
  style: ChartValueStyle;
}

export interface TableChartData {
  categories: string[];
  series: TableChartSeries[];
  style: ChartValueStyle;
}

export const MAX_CHART_SERIES = 8;

const tableRole = (node: PMNode): string | undefined =>
  node.type.spec.tableRole as string | undefined;

/**
 * The table as rows of cell text. A merged cell repeats its text in every
 * position it covers, so each row has the full width of the table.
 */
export const tableMatrix = (table: PMNode): string[][] => {
  const map = TableMap.get(table);
  const rows: string[][] = [];
  for (let row = 0; row < map.height; row++) {
    const cells: string[] = [];
    for (let col = 0; col < map.width; col++) {
      const offset = map.map[row * map.width + col];
      const cell = offset === undefined ? null : table.nodeAt(offset);
      cells.push(cell ? cell.textContent.trim() : '');
    }
    rows.push(cells);
  }
  return rows;
};

/** The table block with this id, or null once it has been deleted. */
export const findTableById = (doc: PMNode, id: string): PMNode | null => {
  let found: PMNode | null = null;
  doc.descendants((node) => {
    if (found) {
      return false;
    }
    if (tableRole(node) === 'table' && node.attrs.id === id) {
      found = node;
      return false;
    }
    return true;
  });
  return found;
};

const CURRENCY = /^[£$€¥]/;
const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  bn: 1e9,
  b: 1e9,
};

/**
 * A cell read as a number, keeping how it was written so the axis can say it
 * the same way: "£1,104k" is 1,104,000 shown with £ and compact units, "18 %"
 * is 18 shown as a percentage, "(1,200)" is -1,200. Text is null.
 */
export const parseChartNumber = (text: string): ChartNumber | null => {
  let rest = text.replace(/[\s\u00a0\u202f]/g, '');
  if (rest === '') {
    return null;
  }

  let negative = false;
  const parenthesised = /^\((.*)\)$/.exec(rest);
  if (parenthesised) {
    negative = true;
    rest = parenthesised[1] ?? '';
  }
  if (rest.startsWith('-') || rest.startsWith('\u2212')) {
    negative = !negative;
    rest = rest.slice(1);
  } else if (rest.startsWith('+')) {
    rest = rest.slice(1);
  }

  let prefix = '';
  const currency = CURRENCY.exec(rest);
  if (currency) {
    prefix = currency[0];
    rest = rest.slice(prefix.length);
  }

  let percent = false;
  if (rest.endsWith('%')) {
    percent = true;
    rest = rest.slice(0, -1);
  }

  let multiplier = 1;
  const unit = /(bn|[kmb])$/i.exec(rest);
  if (unit && /\d/.test(rest.slice(0, -unit[0].length).slice(-1))) {
    multiplier = MULTIPLIERS[unit[0].toLowerCase()] ?? 1;
    rest = rest.slice(0, -unit[0].length);
  }

  const parsed = parseNumberLoose(rest);
  if (parsed === null) {
    return null;
  }
  const value = parsed * multiplier * (negative ? -1 : 1);
  return { value, prefix, percent, compact: multiplier > 1 };
};

const mostCommon = (values: string[]): string => {
  const counts = new Map<string, number>();
  let best = '';
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
};

const styleOf = (numbers: ChartNumber[]): ChartValueStyle => ({
  prefix: mostCommon(numbers.map((n) => n.prefix)),
  percent: numbers.length > 0 && numbers.every((n) => n.percent),
  compact: numbers.some((n) => n.compact),
});

/**
 * How the one y axis writes its values when several series share it: a
 * currency or a percent sign only when every series carries it, compact
 * units as soon as one series uses them.
 */
export const sharedStyle = (styles: ChartValueStyle[]): ChartValueStyle => {
  const first = styles[0];
  if (!first) {
    return { prefix: '', percent: false, compact: false };
  }
  return {
    prefix: styles.every((s) => s.prefix === first.prefix) ? first.prefix : '',
    percent: styles.every((s) => s.percent),
    compact: styles.some((s) => s.compact),
  };
};

/**
 * The labels of the y axis, all in one notation: when any tick needs compact
 * units they all get them, so the axis never reads 50,000 then 100k.
 */
export const axisLabels = (
  ticks: number[],
  style: ChartValueStyle
): string[] => {
  const compact =
    style.compact || ticks.some((tick) => Math.abs(tick) >= 10_000);
  return ticks.map((tick) => formatChartValue(tick, { ...style, compact }));
};

const trimZeros = (text: string): string =>
  text.includes('.') ? text.replace(/\.?0+$/, '') : text;

/** A value written the way its column writes them: £1.1M, 18 %, 1,074. */
export const formatChartValue = (
  value: number,
  style: ChartValueStyle
): string => {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  let body: string;
  if (style.compact || abs >= 100_000) {
    if (abs >= 1e9) {
      body = `${trimZeros((abs / 1e9).toFixed(1))}bn`;
    } else if (abs >= 1e6) {
      body = `${trimZeros((abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1))}M`;
    } else if (abs >= 1e3) {
      body = `${trimZeros((abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1))}k`;
    } else {
      body = trimZeros(abs.toFixed(1));
    }
  } else {
    body = abs.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  }
  return `${sign}${style.prefix}${body}${style.percent ? ' %' : ''}`;
};

/** Share of a column's filled body cells that read as numbers. */
const numericShare = (rows: string[][], col: number): number => {
  let filled = 0;
  let numeric = 0;
  for (const row of rows) {
    const text = row[col] ?? '';
    if (text === '') {
      continue;
    }
    filled++;
    if (parseChartNumber(text)) {
      numeric++;
    }
  }
  return filled === 0 ? 0 : numeric / filled;
};

export const columnNames = (
  matrix: string[][],
  headerRow: boolean
): string[] => {
  const width = Math.max(0, ...matrix.map((row) => row.length));
  const header = headerRow ? (matrix[0] ?? []) : [];
  return Array.from(
    { length: width },
    (_, i) => header[i]?.trim() || `Column ${i + 1}`
  );
};

/**
 * Where a remembered column sits now: the one column whose header still
 * matches its name, else the same position, else nowhere.
 */
export const resolveColumn = (
  names: string[],
  ref: ChartColumnRef | null | undefined
): number | null => {
  if (!ref) {
    return null;
  }
  const wanted = ref.name.trim().toLowerCase();
  if (wanted) {
    const matches = names
      .map((name, i) => (name.trim().toLowerCase() === wanted ? i : -1))
      .filter((i) => i >= 0);
    if (matches.length === 1) {
      return matches[0] ?? null;
    }
  }
  return ref.index >= 0 && ref.index < names.length ? ref.index : null;
};

const looksOrdered = (labels: string[]): boolean => {
  if (labels.length < 3) {
    return false;
  }
  const numbers = labels.map((label) => parseChartNumber(label)?.value);
  if (numbers.every((n) => n !== undefined)) {
    return numbers.every((n, i) => i === 0 || (n ?? 0) > (numbers[i - 1] ?? 0));
  }
  return labels.every(
    (label) =>
      /^\d{4}([-/.]\d{1,2}){0,2}$/.test(label) ||
      /^(q[1-4]|h[12])\b/i.test(label) ||
      !Number.isNaN(Date.parse(label))
  );
};

export interface TableChartSuggestion extends TableChartConfig {
  chartType: TableChartType;
}

/**
 * A first chart for a table: the first mostly-text column (else the first
 * column) across, every mostly-numeric column as a series, a line when the
 * rows run in order (years, dates, quarters), bars otherwise.
 */
export const suggestTableChart = (
  matrix: string[][],
  headerRow = true
): TableChartSuggestion => {
  const names = columnNames(matrix, headerRow);
  const body = headerRow ? matrix.slice(1) : matrix;
  const shares = names.map((_, col) => numericShare(body, col));

  const textColumn = shares.findIndex((share) => share < 0.5);
  const xIndex = textColumn >= 0 ? textColumn : 0;
  const series = names
    .map((name, index) => ({ name, index }))
    .filter(({ index }) => index !== xIndex && (shares[index] ?? 0) >= 0.6)
    .slice(0, MAX_CHART_SERIES);

  const labels = body
    .map((row) => row[xIndex] ?? '')
    .filter((label) => label !== '');

  return {
    chartType: looksOrdered(labels) ? 'line' : 'bar',
    xColumn:
      names.length > 0 ? { index: xIndex, name: names[xIndex] ?? '' } : null,
    series,
    headerRow,
  };
};

/**
 * The categories and series the chart draws. A row with no label and no value
 * is skipped; a cell that is not a number leaves a gap in its series.
 */
export const buildTableChart = (
  matrix: string[][],
  config: TableChartConfig
): TableChartData => {
  const names = columnNames(matrix, config.headerRow);
  const body = config.headerRow ? matrix.slice(1) : matrix;
  const xIndex = resolveColumn(names, config.xColumn);

  // The palette slot is the column's rank among the columns that can be
  // plotted: ticking another series on or off never repaints this one.
  const slotOf = (index: number) =>
    xIndex !== null && index > xIndex ? index - 1 : index;
  const resolved = config.series
    .map((ref) => ({ ref, index: resolveColumn(names, ref) }))
    .filter(
      (entry): entry is { ref: ChartSeriesRef; index: number } =>
        entry.index !== null && entry.index !== xIndex
    )
    .filter(
      (entry, i, all) =>
        all.findIndex((other) => other.index === entry.index) === i
    )
    .map((entry) => ({ ...entry, slot: slotOf(entry.index) }));

  const parsedRows = body.map((row) => ({
    label: xIndex === null ? '' : (row[xIndex] ?? ''),
    numbers: resolved.map(({ index }) => parseChartNumber(row[index] ?? '')),
  }));
  const rows = parsedRows.filter(
    (row) => row.label !== '' || row.numbers.some((n) => n !== null)
  );

  const series = resolved.map(({ ref, slot, index }, position) => {
    const numbers = rows.map((row) => row.numbers[position] ?? null);
    const present = numbers.filter((n): n is ChartNumber => n !== null);
    return {
      key: `${index}`,
      name: names[index] ?? ref.name,
      slot,
      color: ref.color ?? null,
      values: numbers.map((n) => (n ? n.value : null)),
      style: styleOf(present),
    };
  });

  return {
    categories: rows.map((row, i) => row.label || `#${i + 1}`),
    series,
    style: sharedStyle(series.map((s) => s.style)),
  };
};

const niceStep = (rough: number): number => {
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const fraction = rough / power;
  const nice =
    fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 2.5
          ? 2.5
          : fraction <= 5
            ? 5
            : 10;
  return nice * power;
};

/**
 * Round axis ticks covering [min, max]: 0 / 50k / 100k rather than 0 / 43k /
 * 86k. The domain is widened to the outer ticks.
 */
export const niceTicks = (min: number, max: number, count = 5): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0];
  }
  if (min === max) {
    if (min === 0) {
      return [0, 1];
    }
    const pad = Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  const step = niceStep((max - min) / Math.max(1, count - 1));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) {
    // Snap away float drift (0.30000000000000004).
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
};

/**
 * The value range the y axis must show. Bars, stacks and areas grow from
 * zero, so zero is always in; a line may start at its data when asked.
 */
export const valueDomain = (
  data: TableChartData,
  chartType: TableChartType,
  fromZero: boolean
): [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  if (chartType === 'stacked') {
    data.categories.forEach((_, i) => {
      let up = 0;
      let down = 0;
      for (const series of data.series) {
        const value = series.values[i] ?? 0;
        if (value >= 0) up += value;
        else down += value;
      }
      max = Math.max(max, up);
      min = Math.min(min, down);
    });
  } else {
    for (const series of data.series) {
      for (const value of series.values) {
        if (value === null) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }
  if (min === Infinity) {
    return [0, 0];
  }
  if (chartType !== 'line' || fromZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  return [min, max];
};
