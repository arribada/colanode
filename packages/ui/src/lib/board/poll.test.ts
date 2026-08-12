import { describe, expect, it } from 'vitest';

import { BoardElement } from '@colanode/core';
import { tallyPoll, togglePollVote } from '@colanode/ui/lib/board/poll';

const poll = (
  options: string[],
  votes: Record<string, number[]>,
  multiple = false
): BoardElement =>
  ({
    id: 'p',
    type: 'poll',
    x: 0,
    y: 0,
    w: 240,
    h: 160,
    z: 'a0',
    style: {},
    poll: { options, votes, multiple },
  }) as BoardElement;

describe('tallyPoll', () => {
  it('counts each option', () => {
    const t = tallyPoll(poll(['a', 'b'], { u1: [0], u2: [0], u3: [1] }));
    expect(t.counts).toEqual([2, 1]);
    expect(t.voters).toBe(3);
    expect(t.cast).toBe(3);
  });

  it('counts a person once even with several choices', () => {
    const t = tallyPoll(poll(['a', 'b'], { u1: [0, 1] }, true));
    expect(t.counts).toEqual([1, 1]);
    expect(t.voters).toBe(1);
    expect(t.cast).toBe(2);
  });

  it('drops votes for an option that no longer exists', () => {
    // Removing an option leaves old indexes pointing nowhere. Those votes are
    // dropped rather than crashing the count — or worse, being handed to
    // whatever option now sits at that position.
    const t = tallyPoll(poll(['a'], { u1: [0], u2: [5], u3: [-1] }));
    expect(t.counts).toEqual([1]);
    expect(t.voters).toBe(1);
  });

  it('is empty for a poll nobody has voted in', () => {
    const t = tallyPoll(poll(['a', 'b'], {}));
    expect(t.counts).toEqual([0, 0]);
    expect(t.voters).toBe(0);
    // max never drops below 1, so the bars divide by something
    expect(t.max).toBe(1);
  });

  it('survives an element with no poll at all', () => {
    const t = tallyPoll({ id: 'x', type: 'rect' } as BoardElement);
    expect(t.counts).toEqual([]);
    expect(t.voters).toBe(0);
  });
});

describe('togglePollVote', () => {
  it('casts a vote', () => {
    expect(togglePollVote(poll(['a', 'b'], {}), 'u1', 1)).toEqual([1]);
  });

  it('withdraws it when clicked again', () => {
    // A vote you cannot take back is one people hesitate to cast.
    expect(togglePollVote(poll(['a', 'b'], { u1: [1] }), 'u1', 1)).toEqual([]);
  });

  it('replaces the choice in a single-answer poll', () => {
    expect(togglePollVote(poll(['a', 'b'], { u1: [0] }), 'u1', 1)).toEqual([1]);
  });

  it('adds to the choices when several are allowed', () => {
    expect(
      togglePollVote(poll(['a', 'b'], { u1: [0] }, true), 'u1', 1)
    ).toEqual([0, 1]);
  });

  it('leaves other people alone', () => {
    const p = poll(['a', 'b'], { u1: [0], u2: [1] });
    expect(togglePollVote(p, 'u2', 0)).toEqual([0]);
    expect(p.poll!.votes.u1).toEqual([0]);
  });
});
