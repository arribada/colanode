// Fractional indexing for board element z-order. Keys are base-62 strings
// interpreted as fractions in (0, 1); lexicographic string comparison equals
// numeric order, so a key can always be generated strictly between any two
// existing keys (or before the first / after the last) without renumbering.

const DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

// Returns a fraction string c such that value(a) < value(c) < value(b), where
// a is a fraction string ('' === 0) and b is a fraction string with the
// convention that '' === 1 (the exclusive upper bound). The result never ends
// in the lowest digit, keeping the space infinitely subdividable.
const midpoint = (a: string, b: string): string => {
  const upperIsOne = b === '';

  if (!upperIsOne) {
    // Strip the longest common prefix (a is virtually padded with zeros).
    let n = 0;
    while (n < b.length && (a[n] ?? '0') === b[n]) {
      n++;
    }
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
    }
  }

  const digitA = a.length > 0 ? DIGITS.indexOf(a[0]!) : 0;
  const digitB = upperIsOne ? BASE : DIGITS.indexOf(b[0]!);

  if (digitB - digitA > 1) {
    const mid = Math.round((digitA + digitB) / 2);
    return DIGITS[mid]!;
  }

  // Digits are consecutive: keep digitA and recurse deeper against the upper
  // bound 1.0. Any key sharing this first digit stays below digitA + 1 <= b.
  return DIGITS[digitA]! + midpoint(a.slice(1), '');
};

/**
 * Generate a key strictly ordered between `a` and `b`.
 * Pass `null` for `a` to place before all keys, `null` for `b` to place after.
 */
export const generateKeyBetween = (
  a: string | null,
  b: string | null
): string => {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`generateKeyBetween: ${a} is not < ${b}`);
  }
  return midpoint(a ?? '', b ?? '');
};

/** Generate `n` keys evenly ordered between `a` and `b`. */
export const generateNKeysBetween = (
  a: string | null,
  b: string | null,
  n: number
): string[] => {
  if (n <= 0) {
    return [];
  }
  if (n === 1) {
    return [generateKeyBetween(a, b)];
  }

  const mid = generateKeyBetween(a, b);
  const left = Math.floor(n / 2);
  return [
    ...generateNKeysBetween(a, mid, left),
    mid,
    ...generateNKeysBetween(mid, b, n - left - 1),
  ];
};

/** Key ordered after every key in `keys` (or a first key if empty). */
export const keyAfterAll = (keys: string[]): string => {
  if (keys.length === 0) {
    return generateKeyBetween(null, null);
  }
  const max = keys.reduce((acc, k) => (k > acc ? k : acc), keys[0]!);
  return generateKeyBetween(max, null);
};

/** Key ordered before every key in `keys` (or a first key if empty). */
export const keyBeforeAll = (keys: string[]): string => {
  if (keys.length === 0) {
    return generateKeyBetween(null, null);
  }
  const min = keys.reduce((acc, k) => (k < acc ? k : acc), keys[0]!);
  return generateKeyBetween(null, min);
};

/** Stable comparator for z keys (ties broken by nothing — keys are unique). */
export const compareZ = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
