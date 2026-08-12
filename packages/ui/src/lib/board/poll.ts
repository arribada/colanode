// Poll arithmetic, kept out of the renderer so it can be tested without one.

import { BoardElement } from '@colanode/core';

export interface PollTally {
  /** Votes per option, in option order. */
  counts: number[];
  /** How many people have voted at all. */
  voters: number;
  /** Total votes cast — larger than `voters` when several choices are allowed. */
  cast: number;
  /** Share of the winning option, 0–1, for the bars. */
  max: number;
}

export const tallyPoll = (element: BoardElement): PollTally => {
  const poll = element.poll;
  const options = poll?.options ?? [];
  const counts = new Array<number>(options.length).fill(0);
  let cast = 0;
  let voters = 0;

  for (const choices of Object.values(poll?.votes ?? {})) {
    let counted = false;
    for (const index of choices ?? []) {
      // An option removed after people voted leaves indexes pointing nowhere.
      // Those votes are dropped from the count rather than crashing it or
      // being silently attributed to whatever now sits at that position.
      if (index >= 0 && index < counts.length) {
        counts[index] = (counts[index] ?? 0) + 1;
        cast++;
        counted = true;
      }
    }
    if (counted) {
      voters++;
    }
  }

  return { counts, voters, cast, max: Math.max(1, ...counts) };
};

/**
 * The choices `userId` would have after clicking `index`.
 *
 * Clicking your own choice again withdraws it — a vote you cannot take back
 * is one people hesitate to cast.
 */
export const togglePollVote = (
  element: BoardElement,
  userId: string,
  index: number
): number[] => {
  const poll = element.poll;
  const current = poll?.votes?.[userId] ?? [];
  if (current.includes(index)) {
    return current.filter((i) => i !== index);
  }
  return poll?.multiple ? [...current, index] : [index];
};
