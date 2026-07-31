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

const startOfDay = (date: Date): Date => {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const isEmpty = (value: FormulaValue): boolean => {
  if (value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
};

export const FUNCTIONS: Record<string, FormulaFunction> = {
  // --- Logic ---
  not: (args) => !coerceBoolean(arg(args, 0)),
  empty: (args) => isEmpty(arg(args, 0)),
  coalesce: (args) => {
    for (const value of args) {
      if (!isEmpty(value)) return value;
    }
    return null;
  },

  // --- Text ---
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
  contains: (args) =>
    coerceString(arg(args, 0)).includes(coerceString(arg(args, 1))),
  startswith: (args) =>
    coerceString(arg(args, 0)).startsWith(coerceString(arg(args, 1))),
  endswith: (args) =>
    coerceString(arg(args, 0)).endsWith(coerceString(arg(args, 1))),
  indexof: (args) =>
    coerceString(arg(args, 0)).indexOf(coerceString(arg(args, 1))),
  replace: (args) => {
    const s = coerceString(arg(args, 0));
    const search = coerceString(arg(args, 1));
    if (search === '') return s;
    const replacement = coerceString(arg(args, 2));
    return s.replace(new RegExp(escapeRegExp(search), 'g'), replacement);
  },
  repeat: (args) => {
    const s = coerceString(arg(args, 0));
    const count = coerceNumber(arg(args, 1)) ?? 0;
    if (count <= 0 || !isFinite(count)) return '';
    return s.repeat(Math.floor(count));
  },
  padstart: (args) => {
    const s = coerceString(arg(args, 0));
    const len = coerceNumber(arg(args, 1)) ?? 0;
    const fill = arg(args, 2) === null ? ' ' : coerceString(arg(args, 2));
    return s.padStart(len, fill || ' ');
  },
  padend: (args) => {
    const s = coerceString(arg(args, 0));
    const len = coerceNumber(arg(args, 1)) ?? 0;
    const fill = arg(args, 2) === null ? ' ' : coerceString(arg(args, 2));
    return s.padEnd(len, fill || ' ');
  },

  // --- Math ---
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
  sign: (args) => {
    const n = coerceNumber(arg(args, 0));
    return n === null ? null : Math.sign(n);
  },
  sqrt: (args) => {
    const n = coerceNumber(arg(args, 0));
    if (n === null || n < 0) return null;
    return Math.sqrt(n);
  },
  pow: (args) => {
    const base = coerceNumber(arg(args, 0));
    const exp = coerceNumber(arg(args, 1));
    if (base === null || exp === null) return null;
    const result = Math.pow(base, exp);
    return isFinite(result) ? result : null;
  },
  mod: (args) => {
    const a = coerceNumber(arg(args, 0));
    const b = coerceNumber(arg(args, 1));
    if (a === null || b === null || b === 0) return null;
    return a % b;
  },
  log: (args) => {
    const n = coerceNumber(arg(args, 0));
    if (n === null || n <= 0) return null;
    const baseValue = arg(args, 1);
    if (baseValue === null) return Math.log(n);
    const base = coerceNumber(baseValue);
    if (base === null || base <= 0 || base === 1) return null;
    return Math.log(n) / Math.log(base);
  },
  exp: (args) => {
    const n = coerceNumber(arg(args, 0));
    if (n === null) return null;
    const result = Math.exp(n);
    return isFinite(result) ? result : null;
  },
  min: (args) => numericReduce(args, (a, b) => Math.min(a, b)),
  max: (args) => numericReduce(args, (a, b) => Math.max(a, b)),
  sum: (args) => numericReduce(args, (a, b) => a + b) ?? 0,
  average: (args) => {
    const nums = args
      .map((a) => coerceNumber(a))
      .filter((n): n is number => n !== null);
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },
  pi: () => Math.PI,
  e: () => Math.E,

  // --- Date ---
  now: (_args, runtime) => new Date(runtime.now.getTime()),
  today: (_args, runtime) => startOfDay(runtime.now),
  year: (args) => {
    const d = coerceDate(arg(args, 0));
    return d ? d.getFullYear() : null;
  },
  month: (args) => {
    const d = coerceDate(arg(args, 0));
    return d ? d.getMonth() + 1 : null;
  },
  day: (args) => {
    const d = coerceDate(arg(args, 0));
    return d ? d.getDate() : null;
  },
  hour: (args) => {
    const d = coerceDate(arg(args, 0));
    return d ? d.getHours() : null;
  },
  minute: (args) => {
    const d = coerceDate(arg(args, 0));
    return d ? d.getMinutes() : null;
  },
  second: (args) => {
    const d = coerceDate(arg(args, 0));
    return d ? d.getSeconds() : null;
  },
  weekday: (args) => {
    const d = coerceDate(arg(args, 0));
    return d ? d.getDay() : null;
  },
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

  // --- Convert ---
  tonumber: (args) => coerceNumber(arg(args, 0)),
  totext: (args) => coerceString(arg(args, 0)),
  toboolean: (args) => coerceBoolean(arg(args, 0)),
  todate: (args) => coerceDate(arg(args, 0)),
};

// Human-readable catalog of everything callable in a formula, including the
// control functions handled directly by the evaluator (if/and/or/prop). Drives
// the function palette in the formula editor and keeps the docs in sync with
// the engine.
export type FormulaFunctionCategory =
  | 'Logic'
  | 'Text'
  | 'Math'
  | 'Date'
  | 'Convert';

export interface FormulaFunctionDoc {
  name: string;
  signature: string;
  description: string;
  category: FormulaFunctionCategory;
  // What to drop into the expression when the entry is clicked.
  snippet: string;
}

const doc = (
  name: string,
  signature: string,
  description: string,
  category: FormulaFunctionCategory,
  snippet?: string
): FormulaFunctionDoc => ({
  name,
  signature,
  description,
  category,
  snippet: snippet ?? `${name}()`,
});

export const FORMULA_FUNCTION_DOCS: FormulaFunctionDoc[] = [
  // Logic
  doc('prop', "prop('Field')", 'Reference another field by name.', 'Logic', "prop('')"),
  doc('if', 'if(cond, a, b)', 'Return a when cond is true, otherwise b.', 'Logic', 'if()'),
  doc('and', 'and(a, b, …)', 'True when every argument is true.', 'Logic'),
  doc('or', 'or(a, b, …)', 'True when any argument is true.', 'Logic'),
  doc('not', 'not(a)', 'Invert a boolean.', 'Logic'),
  doc('empty', 'empty(a)', 'True when the value is null or blank.', 'Logic'),
  doc('coalesce', 'coalesce(a, b, …)', 'First non-empty value.', 'Logic'),
  // Text
  doc('concat', 'concat(a, b, …)', 'Join values into one string.', 'Text'),
  doc('upper', 'upper(text)', 'Uppercase.', 'Text'),
  doc('lower', 'lower(text)', 'Lowercase.', 'Text'),
  doc('trim', 'trim(text)', 'Remove surrounding whitespace.', 'Text'),
  doc('length', 'length(text)', 'Character count.', 'Text'),
  doc('slice', 'slice(text, start, end?)', 'Substring by index.', 'Text'),
  doc('contains', 'contains(text, part)', 'True when part occurs in text.', 'Text'),
  doc('startswith', 'startsWith(text, part)', 'True when text starts with part.', 'Text'),
  doc('endswith', 'endsWith(text, part)', 'True when text ends with part.', 'Text'),
  doc('indexof', 'indexOf(text, part)', 'Position of part, or -1.', 'Text'),
  doc('replace', 'replace(text, find, with)', 'Replace all occurrences.', 'Text'),
  doc('repeat', 'repeat(text, n)', 'Repeat text n times.', 'Text'),
  doc('padstart', 'padStart(text, len, pad?)', 'Left-pad to length.', 'Text'),
  doc('padend', 'padEnd(text, len, pad?)', 'Right-pad to length.', 'Text'),
  // Math
  doc('round', 'round(n, digits?)', 'Round to digits (default 0).', 'Math'),
  doc('floor', 'floor(n)', 'Round down.', 'Math'),
  doc('ceil', 'ceil(n)', 'Round up.', 'Math'),
  doc('abs', 'abs(n)', 'Absolute value.', 'Math'),
  doc('sign', 'sign(n)', '-1, 0 or 1.', 'Math'),
  doc('sqrt', 'sqrt(n)', 'Square root.', 'Math'),
  doc('pow', 'pow(base, exp)', 'base to the power exp.', 'Math'),
  doc('mod', 'mod(a, b)', 'Remainder of a / b.', 'Math'),
  doc('log', 'log(n, base?)', 'Logarithm (natural by default).', 'Math'),
  doc('exp', 'exp(n)', 'e to the power n.', 'Math'),
  doc('min', 'min(a, b, …)', 'Smallest value.', 'Math'),
  doc('max', 'max(a, b, …)', 'Largest value.', 'Math'),
  doc('sum', 'sum(a, b, …)', 'Add all values.', 'Math'),
  doc('average', 'average(a, b, …)', 'Mean of values.', 'Math'),
  doc('pi', 'pi()', 'The constant π.', 'Math'),
  doc('e', 'e()', "Euler's number.", 'Math'),
  // Date
  doc('now', 'now()', 'Current date and time.', 'Date'),
  doc('today', 'today()', 'Current date at midnight.', 'Date'),
  doc('year', 'year(date)', 'Year component.', 'Date'),
  doc('month', 'month(date)', 'Month 1-12.', 'Date'),
  doc('day', 'day(date)', 'Day of month.', 'Date'),
  doc('hour', 'hour(date)', 'Hour 0-23.', 'Date'),
  doc('minute', 'minute(date)', 'Minute 0-59.', 'Date'),
  doc('second', 'second(date)', 'Second 0-59.', 'Date'),
  doc('weekday', 'weekday(date)', 'Day of week 0 (Sun) - 6.', 'Date'),
  doc('dateadd', 'dateAdd(date, n, unit)', 'Add n units to a date.', 'Date'),
  doc('datediff', 'dateDiff(a, b, unit)', 'Difference between dates.', 'Date'),
  doc('formatdate', 'formatDate(date, fmt?)', 'Format with YYYY/MM/DD HH:mm:ss.', 'Date'),
  // Convert
  doc('tonumber', 'toNumber(value)', 'Coerce to a number.', 'Convert'),
  doc('totext', 'toText(value)', 'Coerce to text.', 'Convert'),
  doc('toboolean', 'toBoolean(value)', 'Coerce to a boolean.', 'Convert'),
  doc('todate', 'toDate(value)', 'Coerce to a date.', 'Convert'),
];
