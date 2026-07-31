// Pratt parser that turns formula tokens into an AST.
// Handles operator precedence, unary operators, grouping and function calls.

import { FormulaSyntaxError, Token, tokenize } from './tokenizer';

export type FormulaAst =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'unary'; operator: string; operand: FormulaAst }
  | { kind: 'binary'; operator: string; left: FormulaAst; right: FormulaAst }
  | { kind: 'call'; name: string; args: FormulaAst[] };

const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '=': 3,
  '!=': 3,
  '<>': 3,
  '<': 3,
  '>': 3,
  '<=': 3,
  '>=': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
};

const UNARY_PRECEDENCE = 6;

const normalizeOperator = (op: string): string => {
  if (op === '=') return '==';
  if (op === '<>') return '!=';
  return op;
};

class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  public parse(): FormulaAst {
    const expr = this.parseExpression(0);
    const token = this.peek();
    if (token.type !== 'eof') {
      throw new FormulaSyntaxError(
        `Unexpected token '${token.value}'`,
        token.start
      );
    }
    return expr;
  }

  private parseExpression(minBp: number): FormulaAst {
    let left = this.parsePrefix();

    for (;;) {
      const token = this.peek();
      if (token.type !== 'operator') break;
      const bp = BINARY_PRECEDENCE[token.value];
      if (bp === undefined || bp < minBp) break;
      this.next();
      const right = this.parseExpression(bp + 1);
      left = {
        kind: 'binary',
        operator: normalizeOperator(token.value),
        left,
        right,
      };
    }

    return left;
  }

  private parsePrefix(): FormulaAst {
    const token = this.next();

    if (token.type === 'number') {
      return { kind: 'number', value: Number(token.value) };
    }

    if (token.type === 'string') {
      return { kind: 'string', value: token.value };
    }

    if (token.type === 'operator') {
      if (token.value === '-' || token.value === '!') {
        const operand = this.parseExpression(UNARY_PRECEDENCE);
        return { kind: 'unary', operator: token.value, operand };
      }
      if (token.value === '+') {
        return this.parseExpression(UNARY_PRECEDENCE);
      }
      throw new FormulaSyntaxError(
        `Unexpected operator '${token.value}'`,
        token.start
      );
    }

    if (token.type === 'lparen') {
      const expr = this.parseExpression(0);
      this.expect('rparen', ')');
      return expr;
    }

    if (token.type === 'identifier') {
      const lower = token.value.toLowerCase();
      if (lower === 'true') return { kind: 'boolean', value: true };
      if (lower === 'false') return { kind: 'boolean', value: false };
      if (lower === 'null') return { kind: 'null' };

      if (this.peek().type === 'lparen') {
        this.next();
        const args: FormulaAst[] = [];
        if (this.peek().type !== 'rparen') {
          for (;;) {
            args.push(this.parseExpression(0));
            if (this.peek().type === 'comma') {
              this.next();
              continue;
            }
            break;
          }
        }
        this.expect('rparen', ')');
        return { kind: 'call', name: lower, args };
      }

      throw new FormulaSyntaxError(
        `Unknown identifier '${token.value}'. Use prop('${token.value}') to reference a field.`,
        token.start
      );
    }

    throw new FormulaSyntaxError(
      `Unexpected token '${token.value}'`,
      token.start
    );
  }

  private expect(type: Token['type'], value: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new FormulaSyntaxError(`Expected '${value}'`, token.start);
    }
    return this.next();
  }
}

export const parse = (expression: string): FormulaAst => {
  const tokens = tokenize(expression);
  return new Parser(tokens).parse();
};

export const collectDependencies = (ast: FormulaAst): string[] => {
  const deps = new Set<string>();

  const walk = (node: FormulaAst): void => {
    switch (node.kind) {
      case 'unary':
        walk(node.operand);
        break;
      case 'binary':
        walk(node.left);
        walk(node.right);
        break;
      case 'call':
        if (
          node.name === 'prop' &&
          node.args.length > 0 &&
          node.args[0]!.kind === 'string'
        ) {
          deps.add((node.args[0] as { kind: 'string'; value: string }).value);
        }
        node.args.forEach(walk);
        break;
      default:
        break;
    }
  };

  walk(ast);
  return Array.from(deps);
};
