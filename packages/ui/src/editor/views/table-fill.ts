// ABOUTME: Pure spreadsheet-style fill-series logic for the editor table.
// ABOUTME: Detects a trailing-number pattern (REQ-1 -> REQ-2) or an arithmetic
// ABOUTME: step from the dragged source cells and extends it over the fill range.

interface NumericToken {
  prefix: string;
  value: number;
  width: number;
  suffix: string;
}

// Split a string into an optional text prefix, a trailing integer, and an
// optional non-digit suffix, remembering the integer's zero-padded width so
// "REQ-001" continues as "REQ-002" rather than "REQ-2".
const parseTrailingNumber = (text: string): NumericToken | null => {
  const match = text.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1] ?? '',
    value: Number.parseInt(match[2]!, 10),
    width: match[2]!.length,
    suffix: match[3] ?? '',
  };
};

const formatNumeric = (token: NumericToken, value: number): string => {
  const digits =
    value < 0
      ? `-${String(Math.abs(value)).padStart(token.width, '0')}`
      : String(value).padStart(token.width, '0');
  return `${token.prefix}${digits}${token.suffix}`;
};

// Given the dragged source cell values (in fill direction) and how many target
// cells to produce, return the values to write into those target cells.
//
//   ["REQ-1"]        , 3 -> ["REQ-2", "REQ-3", "REQ-4"]   (text+number increments)
//   ["1", "2"]       , 3 -> ["3", "4", "5"]               (step detected from two)
//   ["5"]            , 2 -> ["5", "5"]                     (bare number copies)
//   ["Mon", "Tue"]   , 2 -> ["Mon", "Tue"]                (non-numeric cycles)
//   ["10", "8"]      , 2 -> ["6", "4"]                     (negative step)
export const computeFillSeries = (source: string[], count: number): string[] => {
  if (count <= 0) {
    return [];
  }

  const clean = source.map((value) => value ?? '');
  if (clean.length === 0) {
    return new Array<string>(count).fill('');
  }

  const tokens = clean.map(parseTrailingNumber);
  const samePattern =
    tokens.every((token) => token !== null) &&
    tokens.every(
      (token) =>
        token!.prefix === tokens[0]!.prefix &&
        token!.suffix === tokens[0]!.suffix &&
        Number.isSafeInteger(token!.value)
    );

  if (samePattern) {
    const last = tokens[tokens.length - 1]!;
    let step: number;
    if (tokens.length >= 2) {
      step = last.value - tokens[tokens.length - 2]!.value;
    } else {
      // A lone bare number copies (spreadsheet behavior); a lone text+number
      // token (REQ-1) increments, which is the auto-numbering people expect.
      step = last.prefix !== '' || last.suffix !== '' ? 1 : 0;
    }

    const out: string[] = [];
    let value = last.value;
    for (let i = 0; i < count; i++) {
      value += step;
      out.push(formatNumeric(last, value));
    }
    return out;
  }

  // Mixed / non-numeric: repeat the dragged block cyclically (a plain copy).
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(clean[i % clean.length]!);
  }
  return out;
};
