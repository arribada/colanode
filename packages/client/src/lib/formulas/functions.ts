// Built-in formula functions (string, math and date helpers) invoked by name
// from the evaluator. Each receives already-evaluated argument values.

import {
  coerceBoolean,
  coerceDate,
  coerceNumber,
  coerceString,
  FormulaValue,
} from './values';

export interface FormulaRuntime {
  now: Date;
}

export type FormulaFunction = (
  args: FormulaValue[],
  runtime: FormulaRuntime
) => FormulaValue;

const arg = (args: FormulaValue[], index: number): FormulaValue =>
  index < args.length ? args[index]! : null;

const addToDate = (date: Date, amount: number, unit: string): Date => {
  const d = new Date(date.getTime());
  switch (unit.toLowerCase()) {
    case 'year':
    case 'years':
      d.setFullYear(d.getFullYear() + amount);
      break;
    case 'month':
    case 'months':
      d.setMonth(d.getMonth() + amount);
      break;
    case 'week':
    case 'weeks':
      d.setDate(d.getDate() + amount * 7);
      break;
    case 'day':
    case 'days':
      d.setDate(d.getDate() + amount);
      break;
    case 'hour':
    case 'hours':
      d.setHours(d.getHours() + amount);
      break;
    case 'minute':
    case 'minutes':
      d.setMinutes(d.getMinutes() + amount);
      break;
    case 'second':
    case 'seconds':
      d.setSeconds(d.getSeconds() + amount);
      break;
    default:
      d.setDate(d.getDate() + amount);
      break;
  }
  return d;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const diffDates = (from: Date, to: Date, unit: string): number => {
  const ms = to.getTime() - from.getTime();
  switch (unit.toLowerCase()) {
    case 'year':
    case 'years':
      return to.getFullYear() - from.getFullYear();
    case 'month':
    case 'months':
      return (
        (to.getFullYear() - from.getFullYear()) * 12 +
        (to.getMonth() - from.getMonth())
      );
    case 'week':
    case 'weeks':
      return Math.trunc(ms / (MS_PER_DAY * 7));
    case 'day':
    case 'days':
      return Math.trunc(ms / MS_PER_DAY);
    case 'hour':
    case 'hours':
      return Math.trunc(ms / (1000 * 60 * 60));
    case 'minute':
    case 'minutes':
      return Math.trunc(ms / (1000 * 60));
    case 'second':
    case 'seconds':
      return Math.trunc(ms / 1000);
    default:
      return Math.trunc(ms / MS_PER_DAY);
  }
};

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

const formatDate = (date: Date, format?: string): string => {
  if (!format) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return format
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));
};

const numericReduce = (
  args: FormulaValue[],
  reducer: (a: number, b: number) => number
): number | null => {
  const nums = args
    .map((a) => coerceNumber(a))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  return nums.reduce(reducer);
};

export const FUNCTIONS: Record<string, FormulaFunction> = {
  not: (args) => !coerceBoolean(arg(args, 0)),
  concat: (args) => args.map((a) => coerceString(a)).join(''),
  upper: (args) => coerceString(arg(args, 0)).toUpperCase(),
  lower: (args) => coerceString(arg(args, 0)).toLowerCase(),
  length: (args) => coerceString(arg(args, 0)).length,
  trim: (args) => coerceString(arg(args, 0)).trim(),
  slice: (args) => {
    const s = coerceString(arg(args, 0));
    const start = coerceNumber(arg(args, 1)) ?? 0;
    const endValue = arg(args, 2);
    const end =
      endValue === null ? undefined : (coerceNumber(endValue) ?? undefined);
    return s.slice(start, end);
  },
  round: (args) => {
    const n = coerceNumber(arg(args, 0));
    if (n === null) return null;
    const digits = coerceNumber(arg(args, 1)) ?? 0;
    const factor = Math.pow(10, digits);
    return Math.round(n * factor) / factor;
  },
  floor: (args) => {
    const n = coerceNumber(arg(args, 0));
    return n === null ? null : Math.floor(n);
  },
  ceil: (args) => {
    const n = coerceNumber(arg(args, 0));
    return n === null ? null : Math.ceil(n);
  },
  abs: (args) => {
    const n = coerceNumber(arg(args, 0));
    return n === null ? null : Math.abs(n);
  },
  min: (args) => numericReduce(args, (a, b) => Math.min(a, b)),
  max: (args) => numericReduce(args, (a, b) => Math.max(a, b)),
  now: (_args, runtime) => new Date(runtime.now.getTime()),
  dateadd: (args) => {
    const date = coerceDate(arg(args, 0));
    if (!date) return null;
    const amount = coerceNumber(arg(args, 1)) ?? 0;
    const unit = coerceString(arg(args, 2)) || 'days';
    return addToDate(date, amount, unit);
  },
  datediff: (args) => {
    const from = coerceDate(arg(args, 0));
    const to = coerceDate(arg(args, 1));
    if (!from || !to) return null;
    const unit = coerceString(arg(args, 2)) || 'days';
    return diffDates(from, to, unit);
  },
  formatdate: (args) => {
    const date = coerceDate(arg(args, 0));
    if (!date) return null;
    const fmtValue = arg(args, 1);
    const fmt = fmtValue === null ? undefined : coerceString(fmtValue);
    return formatDate(date, fmt);
  },
};
