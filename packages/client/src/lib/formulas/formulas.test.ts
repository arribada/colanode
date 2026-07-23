import { describe, expect, it } from 'vitest';

import type { FieldAttributes } from '@colanode/core';

import { evaluate } from './evaluator';
import {
  buildRecordFormulaContext,
  evaluateFormula,
  evaluateFormulaField,
  formatFormulaValue,
  getFormulaDependencies,
  validateFormula,
  type FormulaContext,
} from './index';
import { collectDependencies, parse } from './parser';
import { tokenize } from './tokenizer';

const emptyContext: FormulaContext = {
  getProp: () => null,
  runtime: { now: new Date('2024-01-01T00:00:00.000Z') },
};

const evalWith = (
  expression: string,
  getProp: (name: string) => unknown = () => null,
  now = new Date('2024-01-01T00:00:00.000Z')
) =>
  evaluateFormula(expression, {
    getProp: getProp as FormulaContext['getProp'],
    runtime: { now },
  });

describe('tokenizer', () => {
  it('tokenizes numbers, strings, identifiers and operators', () => {
    const tokens = tokenize("1 + prop('A') * 2 == 'x'");
    expect(tokens.map((t) => t.type)).toEqual([
      'number',
      'operator',
      'identifier',
      'lparen',
      'string',
      'rparen',
      'operator',
      'number',
      'operator',
      'string',
      'eof',
    ]);
  });

  it('handles multi-char operators', () => {
    const tokens = tokenize('a <= b >= c != d');
    const ops = tokens.filter((t) => t.type === 'operator').map((t) => t.value);
    expect(ops).toEqual(['<=', '>=', '!=']);
  });

  it('throws on unterminated strings', () => {
    expect(() => tokenize("'abc")).toThrow();
  });
});

describe('parser', () => {
  it('respects arithmetic precedence', () => {
    expect(evalWith('1 + 2 * 3').value).toBe(7);
    expect(evalWith('(1 + 2) * 3').value).toBe(9);
    expect(evalWith('2 * 3 + 4 * 5').value).toBe(26);
  });

  it('parses unary minus and not', () => {
    expect(evalWith('-5 + 2').value).toBe(-3);
    expect(evalWith('!(1 == 1)').value).toBe(false);
  });

  it('reports a parse error for a bare identifier', () => {
    expect(validateFormula('Price + 1')).toMatch(/Unknown identifier/);
  });

  it('reports a parse error for unbalanced parentheses', () => {
    expect(validateFormula('(1 + 2')).not.toBeNull();
  });

  it('collects prop dependencies', () => {
    const ast = parse("prop('A') + prop('B') * prop('A')");
    expect(collectDependencies(ast).sort()).toEqual(['A', 'B']);
    expect(getFormulaDependencies("if(prop('X'), prop('Y'), 0)").sort()).toEqual(
      ['X', 'Y']
    );
  });
});

describe('arithmetic and comparisons', () => {
  it('computes basic arithmetic', () => {
    expect(evalWith('10 - 4').value).toBe(6);
    expect(evalWith('10 / 4').value).toBe(2.5);
    expect(evalWith('10 % 3').value).toBe(1);
  });

  it('returns null on division by zero', () => {
    expect(evalWith('1 / 0').value).toBeNull();
    expect(evalWith('5 % 0').value).toBeNull();
  });

  it('propagates null through arithmetic', () => {
    expect(evalWith("prop('missing') + 1").value).toBeNull();
  });

  it('evaluates comparisons', () => {
    expect(evalWith('1 < 2').value).toBe(true);
    expect(evalWith('2 <= 2').value).toBe(true);
    expect(evalWith('3 > 5').value).toBe(false);
    expect(evalWith("'a' == 'a'").value).toBe(true);
    expect(evalWith("'a' != 'b'").value).toBe(true);
    expect(evalWith('1 = 1').value).toBe(true);
    expect(evalWith('1 <> 2').value).toBe(true);
  });
});

describe('logical functions and operators', () => {
  it('evaluates and/or/not', () => {
    expect(evalWith('and(true, true, false)').value).toBe(false);
    expect(evalWith('or(false, false, true)').value).toBe(true);
    expect(evalWith('not(false)').value).toBe(true);
  });

  it('short-circuits && and ||', () => {
    expect(evalWith('false && (1 / 0 == 0)').value).toBe(false);
    expect(evalWith('true || (1 / 0 == 0)').value).toBe(true);
  });

  it('if picks the right branch lazily', () => {
    expect(evalWith("if(1 < 2, 'yes', 'no')").value).toBe('yes');
    expect(evalWith("if(1 > 2, 'yes', 'no')").value).toBe('no');
    // the untaken branch is not evaluated, so an error there is ignored
    expect(evalWith('if(true, 42, 1 / 0)').value).toBe(42);
  });
});

describe('string functions', () => {
  it('concatenates and transforms strings', () => {
    expect(evalWith("concat('a', 'b', 'c')").value).toBe('abc');
    expect(evalWith("concat('n=', 5)").value).toBe('n=5');
    expect(evalWith("upper('abc')").value).toBe('ABC');
    expect(evalWith("lower('ABC')").value).toBe('abc');
    expect(evalWith("length('hello')").value).toBe(5);
    expect(evalWith("slice('hello', 1, 3)").value).toBe('el');
    expect(evalWith("slice('hello', 2)").value).toBe('llo');
  });
});

describe('math functions', () => {
  it('rounds, floors, ceils and abs', () => {
    expect(evalWith('round(3.14159, 2)').value).toBe(3.14);
    expect(evalWith('round(2.5)').value).toBe(3);
    expect(evalWith('floor(2.9)').value).toBe(2);
    expect(evalWith('ceil(2.1)').value).toBe(3);
    expect(evalWith('abs(-7)').value).toBe(7);
  });

  it('computes min and max', () => {
    expect(evalWith('min(3, 1, 2)').value).toBe(1);
    expect(evalWith('max(3, 1, 2)').value).toBe(3);
  });
});

describe('date functions', () => {
  const now = new Date('2024-03-15T12:00:00.000Z');

  it('now returns the runtime clock', () => {
    const result = evalWith('now()', () => null, now);
    expect(result.value).toBeInstanceOf(Date);
    expect((result.value as Date).getTime()).toBe(now.getTime());
  });

  it('dateAdd adds units', () => {
    const result = evalWith("dateAdd(now(), 2, 'days')", () => null, now);
    expect((result.value as Date).getUTCDate()).toBe(17);
  });

  it('dateDiff returns the difference', () => {
    const getProp = (name: string) =>
      name === 'start'
        ? new Date('2024-03-10T00:00:00.000Z')
        : new Date('2024-03-15T00:00:00.000Z');
    expect(
      evalWith("dateDiff(prop('start'), prop('end'), 'days')", getProp).value
    ).toBe(5);
  });

  it('formatDate formats with a pattern', () => {
    const getProp = () => new Date('2024-03-05T00:00:00.000Z');
    expect(evalWith("formatDate(prop('d'), 'YYYY/MM/DD')", getProp).value).toBe(
      '2024/03/05'
    );
  });
});

describe('prop resolution and errors', () => {
  it('resolves field values by name', () => {
    const getProp = (name: string) => (name === 'Price' ? 10 : null);
    expect(evalWith("prop('Price') * 2", getProp).value).toBe(20);
  });

  it('errors on unknown functions', () => {
    expect(evalWith('bogus(1)').error).toMatch(/Unknown function/);
  });

  it('errors when prop is not a literal', () => {
    expect(evalWith('prop(1 + 1)').error).toMatch(/prop\(\)/);
  });

  it('surfaces parse errors as evaluation errors', () => {
    expect(evalWith('1 +').error).toBeDefined();
  });
});

describe('formatFormulaValue', () => {
  it('formats each value type', () => {
    expect(formatFormulaValue(null)).toBe('');
    expect(formatFormulaValue(true)).toBe('Yes');
    expect(formatFormulaValue(false)).toBe('No');
    expect(formatFormulaValue(3.5)).toBe('3.5');
    expect(formatFormulaValue('hi')).toBe('hi');
    expect(formatFormulaValue(new Date('2024-03-05T00:00:00.000Z'))).toMatch(
      /2024-03-05/
    );
  });
});

describe('evaluateFormulaField over a record', () => {
  const priceField: FieldAttributes = {
    id: 'f_price',
    type: 'number',
    name: 'Price',
    index: 'a',
  };
  const qtyField: FieldAttributes = {
    id: 'f_qty',
    type: 'number',
    name: 'Quantity',
    index: 'b',
  };
  const totalField = {
    id: 'f_total',
    type: 'formula' as const,
    name: 'Total',
    index: 'c',
    expression: "prop('Price') * prop('Quantity')",
  };

  const fields: FieldAttributes[] = [priceField, qtyField, totalField];

  const record = {
    fields: {
      f_price: { type: 'number' as const, value: 4 },
      f_qty: { type: 'number' as const, value: 3 },
    },
  };

  it('computes a formula referencing sibling fields', () => {
    const result = evaluateFormulaField(totalField, record, fields);
    expect(result.error).toBeUndefined();
    expect(result.value).toBe(12);
  });

  it('recomputes when a referenced field changes', () => {
    const updated = {
      fields: {
        f_price: { type: 'number' as const, value: 10 },
        f_qty: { type: 'number' as const, value: 2 },
      },
    };
    expect(evaluateFormulaField(totalField, updated, fields).value).toBe(20);
  });

  it('resolves nested formula references', () => {
    const taxField = {
      id: 'f_tax',
      type: 'formula' as const,
      name: 'Tax',
      index: 'd',
      expression: "prop('Total') * 0.2",
    };
    const result = evaluateFormulaField(taxField, record, [...fields, taxField]);
    expect(result.value).toBeCloseTo(2.4);
  });

  it('detects circular references', () => {
    const a = {
      id: 'f_a',
      type: 'formula' as const,
      name: 'A',
      index: 'e',
      expression: "prop('B') + 1",
    };
    const b = {
      id: 'f_b',
      type: 'formula' as const,
      name: 'B',
      index: 'f',
      expression: "prop('A') + 1",
    };
    const result = evaluateFormulaField(a, record, [a, b]);
    expect(result.error).toMatch(/[Cc]ircular/);
  });
});

describe('buildRecordFormulaContext', () => {
  it('resolves date fields as Date objects', () => {
    const dueField: FieldAttributes = {
      id: 'f_due',
      type: 'date',
      name: 'Due',
      index: 'a',
    };
    const context = buildRecordFormulaContext(
      { fields: { f_due: { type: 'string', value: '2024-06-01' } } },
      [dueField]
    );
    const value = context.getProp('Due');
    expect(value).toBeInstanceOf(Date);
  });

  it('returns null for unknown fields', () => {
    const context = buildRecordFormulaContext({ fields: {} }, []);
    expect(context.getProp('Nope')).toBeNull();
  });
});

describe('empty and whitespace expressions', () => {
  it('treats empty expression as valid but null', () => {
    expect(validateFormula('')).toBeNull();
    expect(evaluate(parse('0'), emptyContext)).toBe(0);
  });
});
