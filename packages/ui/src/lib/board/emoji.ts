// Turns an emoji's stored codepoints into the character itself.

/**
 * `unified` is a dash-separated list of hex codepoints, and a single emoji can
 * be several of them: a skin tone, a zero-width joiner, a variation selector.
 * They all have to be emitted together — taking only the first turns a family
 * into a lone man and a flag into a letter.
 */
export const emojiFromUnified = (unified: string): string => {
  const points = unified
    .split('-')
    .map((part) => Number.parseInt(part, 16))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 0x10ffff);
  if (points.length === 0) {
    return '';
  }
  return String.fromCodePoint(...points);
};
