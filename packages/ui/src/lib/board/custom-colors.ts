// Colours the user mixed themselves, kept across sessions.
//
// A custom colour used to vanish the moment the next one was picked: the well
// held one value and nothing remembered it. These are stored in localStorage
// rather than on the board, because a palette belongs to the person mixing it,
// not to one whiteboard.

const KEY = 'colanode.board.customColors';
const MAX = 8;

const isHex = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

export const readCustomColors = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Filtered on the way OUT as well as in: localStorage is shared with
    // whatever else runs on this origin, and a bad value here would end up in
    // a `fill` attribute on the board.
    return parsed
      .filter((v): v is string => typeof v === 'string' && isHex(v))
      .slice(0, MAX);
  } catch {
    return [];
  }
};

/**
 * Puts `color` at the front of the palette, most recent first, and returns the
 * new list. Re-picking a colour already in the list moves it up rather than
 * adding a duplicate.
 */
export const rememberCustomColor = (color: string): string[] => {
  if (!isHex(color)) {
    return readCustomColors();
  }
  const next = [
    color.toLowerCase(),
    ...readCustomColors().filter((c) => c.toLowerCase() !== color.toLowerCase()),
  ].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode, quota, a locked-down browser: the palette is a
    // convenience, never a reason to fail the colour change itself.
  }
  return next;
};
