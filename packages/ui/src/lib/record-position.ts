// ABOUTME: Keys for the hand-made order of a database's records: a record sorts by
// ABOUTME: its position, or by its id until it has one; a move picks a key between.

// Positions and record ids share one alphabet -- digits, then lowercase
// letters, in code-unit order -- and are compared as plain strings, in
// SQLite and in the views alike.
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const MIDDLE = DIGITS[Math.floor(BASE / 2)] ?? 'i';

interface Orderable {
  id: string;
  position?: string | null;
}

// What a record sorts by. A record never moved keeps its id, so a database
// nobody reordered reads in creation order, and a new record lands last.
export const recordOrderKey = (record: Orderable): string =>
  record.position || record.id;

// A character outside the alphabet (no id carries one) still compares by its
// code: it counts as the number of alphabet characters below it.
const digitOf = (char: string): number => {
  const index = DIGITS.indexOf(char);
  if (index >= 0) {
    return index;
  }
  let below = 0;
  for (const d of DIGITS) {
    if (d < char) {
      below += 1;
    }
  }
  return Math.min(below, BASE - 1);
};

// A key strictly between lower and upper (null: no bound). It never ends with
// the lowest digit, which would leave no key between it and its own prefix.
export const positionBetween = (
  lower: string | null,
  upper: string | null
): string => {
  const hi = lower !== null && upper !== null && lower >= upper ? null : upper;

  if (lower !== null && hi === null) {
    // After the last record: stay just above it, by raising its deepest digit
    // that can rise. Jumping to the middle of the alphabet would put the
    // record after every id to come, so records created later would land
    // above the one just dropped at the bottom.
    for (let i = lower.length - 1; i >= 0; i--) {
      const d = digitOf(lower[i]!);
      if (d < BASE - 1) {
        return lower.slice(0, i) + DIGITS[Math.floor((d + BASE) / 2)];
      }
    }
    return lower + MIDDLE;
  }

  let out = '';
  let bounded = hi !== null;

  for (let i = 0; i < 10_000; i++) {
    const a = lower !== null && i < lower.length ? digitOf(lower[i]!) : -1;
    const b = bounded && hi !== null && i < hi.length ? digitOf(hi[i]!) : BASE;

    if (a === b) {
      out += DIGITS[a];
      continue;
    }

    const mid = Math.floor((a + b) / 2);
    if (mid > a) {
      // Room between the two digits. The lowest digit is never a last one.
      return mid === 0 ? out + DIGITS[0] + MIDDLE : out + DIGITS[mid];
    }

    if (a === -1) {
      // The lower key has ended and the upper one goes on with the lowest
      // digit: copy it and look for room further along the upper key.
      out += DIGITS[0];
      continue;
    }

    // Adjacent digits: keep the lower one, and from here on anything after
    // it is below the upper key.
    out += DIGITS[a];
    bounded = false;
  }

  return out + MIDDLE;
};

// The position a record takes when it is dropped at `index` among the others
// shown in order (itself left out): between the keys of its new neighbours.
export const positionForMove = (
  ordered: readonly Orderable[],
  index: number
): string => {
  const clamped = Math.max(0, Math.min(index, ordered.length));
  const before = clamped > 0 ? ordered[clamped - 1] : undefined;
  const after = clamped < ordered.length ? ordered[clamped] : undefined;
  return positionBetween(
    before ? recordOrderKey(before) : null,
    after ? recordOrderKey(after) : null
  );
};

export type DropEdge = 'before' | 'after';

// Where a dragged record lands, counted among the shown records without it:
// just before or just after the one it was dropped on. A target that is not
// in the list (it vanished meanwhile) sends the record to the end.
export const insertionIndex = (
  orderedIds: readonly string[],
  draggedId: string,
  targetId: string,
  edge: DropEdge
): number => {
  const rest = orderedIds.filter((id) => id !== draggedId);
  const at = rest.indexOf(targetId);
  if (at < 0) {
    return rest.length;
  }
  return edge === 'before' ? at : at + 1;
};

// The position of a record dropped on `targetId` (or at the end, with null),
// among `ordered` as shown.
export const positionForDrop = (
  ordered: readonly Orderable[],
  draggedId: string,
  targetId: string | null,
  edge: DropEdge
): string => {
  const rest = ordered.filter((record) => record.id !== draggedId);
  const index =
    targetId === null
      ? rest.length
      : insertionIndex(
          ordered.map((record) => record.id),
          draggedId,
          targetId,
          edge
        );
  return positionForMove(rest, index);
};
