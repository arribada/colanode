// Evaluates a formula AST against a record context, producing a runtime value.
// Handles operators, short-circuiting control functions and field references.

import { FormulaFunction, FormulaRuntime, FUNCTIONS } from './functions';
import { FormulaAst } from './parser';
import {
  coerceBoolean,
  coerceNumber,
  compareValues,
  FormulaValue,
  valuesEqual,
} from './values';

export class FormulaEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvalError';
  }
}

export interface FormulaContext {
  getProp: (name: string) => FormulaValue;
  runtime: FormulaRuntime;
}

export const evaluate = (
  ast: FormulaAst,
  context: FormulaContext
): FormulaValue => {
  switch (ast.kind) {
    case 'number':
      return ast.value;
    case 'string':
      return ast.value;
    case 'boolean':
      return ast.value;
    case 'null':
      return null;
    case 'unary':
      return evaluateUnary(ast.operator, ast.operand, context);
    case 'binary':
      return evaluateBinary(ast.operator, ast.left, ast.right, context);
    case 'call':
      return evaluateCall(ast.name, ast.args, context);
    default:
      return null;
  }
};

const evaluateUnary = (
  operator: string,
  operand: FormulaAst,
  context: FormulaContext
): FormulaValue => {
  const value = evaluate(operand, context);
  if (operator === '-') {
    const n = coerceNumber(value);
    return n === null ? null : -n;
  }
  if (operator === '!') {
    return !coerceBoolean(value);
  }
  throw new FormulaEvalError(`Unknown unary operator '${operator}'`);
};

const arithmetic = (
  operator: string,
  left: FormulaValue,
  right: FormulaValue
): FormulaValue => {
  const a = coerceNumber(left);
  const b = coerceNumber(right);
  if (a === null || b === null) return null;
  switch (operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? null : a / b;
    case '%':
      return b === 0 ? null : a % b;
    default:
      throw new FormulaEvalError(`Unknown operator '${operator}'`);
  }
};

const evaluateBinary = (
  operator: string,
  leftAst: FormulaAst,
  rightAst: FormulaAst,
  context: FormulaContext
): FormulaValue => {
  if (operator === '&&') {
    const left = evaluate(leftAst, context);
    if (!coerceBoolean(left)) return false;
    return coerceBoolean(evaluate(rightAst, context));
  }
  if (operator === '||') {
    const left = evaluate(leftAst, context);
    if (coerceBoolean(left)) return true;
    return coerceBoolean(evaluate(rightAst, context));
  }

  const left = evaluate(leftAst, context);
  const right = evaluate(rightAst, context);

  switch (operator) {
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
      return arithmetic(operator, left, right);
    case '==':
      return valuesEqual(left, right);
    case '!=':
      return !valuesEqual(left, right);
    case '<':
    case '>':
    case '<=':
    case '>=': {
      const cmp = compareValues(left, right);
      if (cmp === null) return false;
      if (operator === '<') return cmp < 0;
      if (operator === '>') return cmp > 0;
      if (operator === '<=') return cmp <= 0;
      return cmp >= 0;
    }
    default:
      throw new FormulaEvalError(`Unknown operator '${operator}'`);
  }
};

const evaluateCall = (
  name: string,
  args: FormulaAst[],
  context: FormulaContext
): FormulaValue => {
  // Lazily-evaluated control functions (branches must not be evaluated eagerly).
  if (name === 'if') {
    const conditionAst = args[0] ?? { kind: 'null' as const };
    const condition = coerceBoolean(evaluate(conditionAst, context));
    const branch = condition ? args[1] : args[2];
    return branch ? evaluate(branch, context) : null;
  }
  if (name === 'and') {
    for (const argAst of args) {
      if (!coerceBoolean(evaluate(argAst, context))) return false;
    }
    return true;
  }
  if (name === 'or') {
    for (const argAst of args) {
      if (coerceBoolean(evaluate(argAst, context))) return true;
    }
    return false;
  }
  if (name === 'prop') {
    const first = args[0];
    if (!first || first.kind !== 'string') {
      throw new FormulaEvalError(
        "prop() requires a field name as a string literal, e.g. prop('Price')"
      );
    }
    return context.getProp(first.value);
  }

  const fn: FormulaFunction | undefined = FUNCTIONS[name];
  if (!fn) {
    throw new FormulaEvalError(`Unknown function '${name}'`);
  }
  const values = args.map((argAst) => evaluate(argAst, context));
  return fn(values, context.runtime);
};
