// Public API for the formula engine: parsing, evaluation, dependency analysis
// and helpers that evaluate a formula field against a record.

import {
  FieldAttributes,
  FormulaFieldAttributes,
} from '@colanode/core';

import { evaluate, FormulaContext, FormulaEvalError } from './evaluator';
import { collectDependencies, FormulaAst, parse } from './parser';
import { coerceDate, FormulaRecordLike, FormulaValue } from './values';

export type { FormulaAst } from './parser';
export type { FormulaContext } from './evaluator';
export type { FormulaValue, FormulaRecordLike } from './values';
export { FormulaSyntaxError } from './tokenizer';
export { FormulaEvalError } from './evaluator';
export {
  coerceBoolean,
  coerceDate,
  coerceNumber,
  coerceString,
} from './values';
export { parse as parseFormula, collectDependencies } from './parser';
export { FORMULA_FUNCTION_DOCS } from './functions';
export type {
  FormulaFunctionDoc,
  FormulaFunctionCategory,
} from './functions';
export * from './rollup';

interface ParsedFormula {
  ast?: FormulaAst;
  error?: string;
}

const parseCache = new Map<string, ParsedFormula>();

const getParsed = (expression: string): ParsedFormula => {
  const cached = parseCache.get(expression);
  if (cached) return cached;

  let result: ParsedFormula;
  try {
    result = { ast: parse(expression) };
  } catch (error) {
    result = {
      error: error instanceof Error ? error.message : 'Invalid formula',
    };
  }
  parseCache.set(expression, result);
  return result;
};

export interface FormulaEvaluation {
  value: FormulaValue;
  error?: string;
}

export const evaluateFormula = (
  expression: string,
  context: FormulaContext
): FormulaEvaluation => {
  const parsed = getParsed(expression);
  if (parsed.error || !parsed.ast) {
    return { value: null, error: parsed.error ?? 'Invalid formula' };
  }
  try {
    return { value: evaluate(parsed.ast, context) };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : 'Evaluation error',
    };
  }
};

export const validateFormula = (expression: string): string | null => {
  if (expression.trim() === '') return null;
  const parsed = getParsed(expression);
  return parsed.error ?? null;
};

export const getFormulaDependencies = (expression: string): string[] => {
  const parsed = getParsed(expression);
  if (!parsed.ast) return [];
  return collectDependencies(parsed.ast);
};

const fieldValueToFormula = (
  field: FieldAttributes,
  record: FormulaRecordLike
): FormulaValue => {
  const raw = record.fields[field.id];
  switch (field.type) {
    case 'number':
      return raw && raw.type === 'number' ? raw.value : null;
    case 'boolean':
      return raw && raw.type === 'boolean' ? raw.value : false;
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
    case 'select':
      return raw && (raw.type === 'string' || raw.type === 'text')
        ? raw.value
        : null;
    case 'date':
      return raw && raw.type === 'string' ? coerceDate(raw.value) : null;
    case 'created_at':
      return record.createdAt ? coerceDate(record.createdAt) : null;
    case 'updated_at':
      return record.updatedAt ? coerceDate(record.updatedAt) : null;
    case 'created_by':
      return record.createdBy ?? null;
    case 'updated_by':
      return record.updatedBy ?? null;
    case 'multi_select':
    case 'collaborator':
    case 'relation':
      return raw && raw.type === 'string_array' ? raw.value.join(', ') : null;
    default:
      return null;
  }
};

export interface BuildContextOptions {
  now?: Date;
  resolveFormulaField?: (field: FormulaFieldAttributes) => FormulaValue;
}

export const buildRecordFormulaContext = (
  record: FormulaRecordLike,
  fields: FieldAttributes[],
  options: BuildContextOptions = {}
): FormulaContext => {
  const byName = new Map<string, FieldAttributes>();
  for (const field of fields) {
    byName.set(field.name.toLowerCase(), field);
  }

  return {
    runtime: { now: options.now ?? new Date() },
    getProp: (name: string): FormulaValue => {
      const field = byName.get(name.toLowerCase());
      if (!field) return null;
      if (field.type === 'formula') {
        return options.resolveFormulaField
          ? options.resolveFormulaField(field)
          : null;
      }
      return fieldValueToFormula(field, record);
    },
  };
};

export const evaluateFormulaField = (
  field: FormulaFieldAttributes,
  record: FormulaRecordLike,
  fields: FieldAttributes[],
  options: { now?: Date } = {}
): FormulaEvaluation => {
  const now = options.now ?? new Date();
  const computing = new Set<string>();

  const evalField = (target: FormulaFieldAttributes): FormulaValue => {
    if (computing.has(target.id)) {
      throw new FormulaEvalError(
        `Circular formula reference at field '${target.name}'`
      );
    }
    computing.add(target.id);

    const context = buildRecordFormulaContext(record, fields, {
      now,
      resolveFormulaField: evalField,
    });

    const parsed = getParsed(target.expression);
    if (parsed.error || !parsed.ast) {
      computing.delete(target.id);
      throw new FormulaEvalError(parsed.error ?? 'Invalid formula');
    }

    const value = evaluate(parsed.ast, context);
    computing.delete(target.id);
    return value;
  };

  try {
    return { value: evalField(field) };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : 'Evaluation error',
    };
  }
};

export const formatFormulaValue = (value: FormulaValue): string => {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value);
};
