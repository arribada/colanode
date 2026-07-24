// Tokenizer for the Colanode formula expression language.
// Converts a raw expression string into a flat list of tokens for the parser.

export type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  start: number;
}

export class FormulaSyntaxError extends Error {
  public readonly position: number;

  constructor(message: string, position: number) {
    super(message);
    this.name = 'FormulaSyntaxError';
    this.position = position;
  }
}

const MULTI_CHAR_OPERATORS = ['&&', '||', '==', '!=', '<>', '<=', '>='];
const SINGLE_CHAR_OPERATORS = ['+', '-', '*', '/', '%', '<', '>', '=', '!'];

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isIdentStart = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentPart = (c: string): boolean => isIdentStart(c) || isDigit(c);

export const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    const c = input[i]!;

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    if (c === '(') {
      tokens.push({ type: 'lparen', value: '(', start: i });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', value: ')', start: i });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ type: 'comma', value: ',', start: i });
      i++;
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      const start = i;
      i++;
      let value = '';
      while (i < n && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < n) {
          const next = input[i + 1]!;
          if (next === 'n') value += '\n';
          else if (next === 't') value += '\t';
          else value += next;
          i += 2;
          continue;
        }
        value += input[i];
        i++;
      }
      if (i >= n) {
        throw new FormulaSyntaxError('Unterminated string literal', start);
      }
      i++;
      tokens.push({ type: 'string', value, start });
      continue;
    }

    if (isDigit(c) || (c === '.' && i + 1 < n && isDigit(input[i + 1]!))) {
      const start = i;
      let value = '';
      let seenDot = false;
      while (i < n) {
        const d = input[i]!;
        if (isDigit(d)) {
          value += d;
          i++;
        } else if (d === '.' && !seenDot) {
          seenDot = true;
          value += d;
          i++;
        } else {
          break;
        }
      }
      tokens.push({ type: 'number', value, start });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      let value = '';
      while (i < n && isIdentPart(input[i]!)) {
        value += input[i];
        i++;
      }
      tokens.push({ type: 'identifier', value, start });
      continue;
    }

    const two = input.slice(i, i + 2);
    if (MULTI_CHAR_OPERATORS.includes(two)) {
      tokens.push({ type: 'operator', value: two, start: i });
      i += 2;
      continue;
    }
    if (SINGLE_CHAR_OPERATORS.includes(c)) {
      tokens.push({ type: 'operator', value: c, start: i });
      i++;
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character '${c}'`, i);
  }

  tokens.push({ type: 'eof', value: '', start: n });
  return tokens;
};
