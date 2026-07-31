// ABOUTME: Aggregation helpers for the database chart view — turns a filtered
// ABOUTME: list of records into grouped buckets (count / sum / average) + colors.
import { LocalRecordNode } from '@colanode/client/types';
import {
  DatabaseViewChartAggregate,
  DatabaseViewChartType,
  FieldAttributes,
  SelectFieldAttributes,
  MultiSelectFieldAttributes,
  SpecialId,
} from '@colanode/core';

export interface ChartBucket {
  key: string;
  label: string;
  color: string;
  value: number;
  count: number;
}

// Maps the named select-option colors to concrete hex values so the inline
// SVG can fill slices/bars without relying on Tailwind classes (SVG fill does
// not read CSS utility classes).
const NAMED_COLORS: Record<string, string> = {
  gray: '#6b7280',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  red: '#ef4444',
};

// Fallback categorical palette for groups that carry no intrinsic color
// (text, dates, users, booleans, ...). Ordered for good visual separation.
export const PALETTE: string[] = [
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#ec4899',
  '#eab308',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
];

const EMPTY_COLOR = '#9ca3af';
const EMPTY_KEY = '__empty__';

export const getNamedColor = (name: string | null | undefined): string => {
  if (!name) {
    return EMPTY_COLOR;
  }
  return NAMED_COLORS[name] ?? EMPTY_COLOR;
};

const getPaletteColor = (index: number): string => {
  return PALETTE[index % PALETTE.length] ?? EMPTY_COLOR;
};

interface RawGroup {
  key: string;
  label: string;
  color: string | null;
}

// Returns the group buckets a single record contributes to for the chosen
// group-by field. Most field types yield one bucket; multi-value fields
// (multi_select / relation / collaborator) yield several.
const getRecordGroups = (
  record: LocalRecordNode,
  field: FieldAttributes | null
): RawGroup[] => {
  // Group by the record name (special "name" pseudo-field).
  if (!field) {
    const name = record.name?.trim();
    if (!name) {
      return [{ key: EMPTY_KEY, label: 'Empty', color: null }];
    }
    return [{ key: name, label: name, color: null }];
  }

  const rawValue = record.fields[field.id]?.value;

  const empty: RawGroup = { key: EMPTY_KEY, label: 'Empty', color: null };

  switch (field.type) {
    case 'select': {
      const optionId = typeof rawValue === 'string' ? rawValue : null;
      if (!optionId) return [empty];
      const option = (field as SelectFieldAttributes).options?.[optionId];
      return [
        {
          key: optionId,
          label: option?.name ?? 'Unknown',
          color: option?.color ? getNamedColor(option.color) : null,
        },
      ];
    }
    case 'multi_select': {
      const ids = Array.isArray(rawValue) ? (rawValue as string[]) : [];
      if (ids.length === 0) return [empty];
      const options = (field as MultiSelectFieldAttributes).options ?? {};
      return ids.map((id) => ({
        key: id,
        label: options[id]?.name ?? 'Unknown',
        color: options[id]?.color ? getNamedColor(options[id]!.color) : null,
      }));
    }
    case 'relation':
    case 'collaborator': {
      const ids = Array.isArray(rawValue) ? (rawValue as string[]) : [];
      if (ids.length === 0) return [empty];
      return ids.map((id) => ({ key: id, label: id, color: null }));
    }
    case 'boolean': {
      if (rawValue === true) {
        return [{ key: 'true', label: 'Yes', color: getNamedColor('green') }];
      }
      if (rawValue === false) {
        return [{ key: 'false', label: 'No', color: getNamedColor('red') }];
      }
      return [empty];
    }
    case 'created_by': {
      return [{ key: record.createdBy, label: record.createdBy, color: null }];
    }
    case 'updated_by': {
      if (!record.updatedBy) return [empty];
      return [{ key: record.updatedBy, label: record.updatedBy, color: null }];
    }
    case 'created_at': {
      const day = normalizeDay(record.createdAt);
      return [{ key: day, label: day, color: null }];
    }
    case 'updated_at': {
      if (!record.updatedAt) return [empty];
      const day = normalizeDay(record.updatedAt);
      return [{ key: day, label: day, color: null }];
    }
    case 'date': {
      if (typeof rawValue !== 'string' || rawValue.length === 0) return [empty];
      const day = normalizeDay(rawValue);
      return [{ key: day, label: day, color: null }];
    }
    default: {
      // text / email / url / phone / number / formula / rollup — stringify.
      if (
        rawValue === null ||
        rawValue === undefined ||
        (typeof rawValue === 'string' && rawValue.length === 0)
      ) {
        return [empty];
      }
      const label = String(rawValue);
      return [{ key: label, label, color: null }];
    }
  }
};

const normalizeDay = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().split('T')[0] ?? value;
};

const getNumericValue = (
  record: LocalRecordNode,
  valueFieldId: string | null | undefined
): number | null => {
  if (!valueFieldId) {
    return null;
  }
  const raw = record.fields[valueFieldId]?.value;
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

interface AggregateOptions {
  records: LocalRecordNode[];
  field: FieldAttributes | null;
  aggregate: DatabaseViewChartAggregate;
  valueFieldId: string | null | undefined;
  chartType: DatabaseViewChartType;
  // Colors the user picked on the legend, keyed by bucket. Beats both the select
  // option's own color and the palette — it is the only one anybody chose on
  // purpose for this chart.
  colorOverrides?: Record<string, string> | null;
}

interface Accumulator {
  key: string;
  label: string;
  color: string | null;
  sum: number;
  count: number;
  order: number;
}

export const resolveGroupField = (
  groupBy: string | null | undefined,
  fields: FieldAttributes[]
): FieldAttributes | null => {
  if (!groupBy || groupBy === SpecialId.Name) {
    return null;
  }
  return fields.find((field) => field.id === groupBy) ?? null;
};

// Reduces the records into ordered chart buckets. `count` counts records per
// group; `sum`/`average` reduce the chosen numeric value field.
export const aggregateRecords = ({
  records,
  field,
  aggregate,
  valueFieldId,
  chartType,
  colorOverrides,
}: AggregateOptions): ChartBucket[] => {
  const map = new Map<string, Accumulator>();
  let order = 0;

  for (const record of records) {
    const groups = getRecordGroups(record, field);
    let contribution = 1;

    if (aggregate !== 'count') {
      const numeric = getNumericValue(record, valueFieldId);
      if (numeric === null) {
        // Records without a numeric value do not contribute to sum/average.
        continue;
      }
      contribution = numeric;
    }

    for (const group of groups) {
      let acc = map.get(group.key);
      if (!acc) {
        acc = {
          key: group.key,
          label: group.label,
          color: group.color,
          sum: 0,
          count: 0,
          order: order++,
        };
        map.set(group.key, acc);
      }
      acc.sum += contribution;
      acc.count += 1;
    }
  }

  let paletteIndex = 0;
  const buckets: ChartBucket[] = Array.from(map.values()).map((acc) => {
    let value: number;
    if (aggregate === 'average') {
      value = acc.count > 0 ? acc.sum / acc.count : 0;
    } else if (aggregate === 'sum') {
      value = acc.sum;
    } else {
      value = acc.count;
    }

    // Priority: what the user picked, then the select option's own color, then
    // the categorical palette. The palette index only advances for groups that
    // actually consume one, so two charts of the same data stay comparable.
    let color = colorOverrides?.[acc.key] ?? acc.color;
    if (!color) {
      color =
        acc.key === EMPTY_KEY ? EMPTY_COLOR : getPaletteColor(paletteIndex++);
    }

    return {
      key: acc.key,
      label: acc.label,
      color,
      value: Math.round(value * 100) / 100,
      count: acc.count,
    };
  });

  // Line charts read as a series — keep the natural (label) ordering so dates
  // and numbers progress left→right. Pie/bar rank by magnitude.
  if (chartType === 'line') {
    buckets.sort((a, b) => a.label.localeCompare(b.label));
  } else {
    buckets.sort((a, b) => b.value - a.value);
  }

  return buckets;
};
