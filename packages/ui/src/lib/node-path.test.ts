import { describe, expect, it } from 'vitest';

import {
  formatPath,
  segmentLabel,
  splitBreadcrumb,
  truncatePathLeft,
} from '@colanode/ui/lib/node-path';

describe('splitBreadcrumb', () => {
  const chain = ['space', 'tracker', 'turtle', 'doppler', 'requirements'];

  it('shows every ancestor while the path fits', () => {
    expect(splitBreadcrumb(chain, false)).toEqual({
      head: chain,
      hidden: [],
      tail: [],
    });
  });

  it('folds only the middle once it overflows', () => {
    expect(splitBreadcrumb(chain, true)).toEqual({
      head: ['space'],
      hidden: ['tracker', 'turtle'],
      tail: ['doppler', 'requirements'],
    });
  });

  it('never folds a path of three or fewer', () => {
    expect(splitBreadcrumb(['space', 'parent', 'page'], true).hidden).toEqual(
      []
    );
  });
});

const doppler = [
  '🚀 Missions & Projects',
  'Mission Tracker',
  'Sea Turtle Tracker',
  'Doppler (SMD)',
];

describe('truncatePathLeft', () => {
  it('shows the whole path when it fits', () => {
    expect(truncatePathLeft(doppler, 200)).toEqual({
      visible: doppler,
      hiddenCount: 0,
    });
  });

  it('drops labels from the left and keeps the immediate parent', () => {
    const { visible, hiddenCount } = truncatePathLeft(doppler, 40);

    expect(visible.at(-1)).toBe('Doppler (SMD)');
    expect(visible[0]).not.toBe('🚀 Missions & Projects');
    expect(hiddenCount).toBe(doppler.length - visible.length);
    expect(['…', ...visible].join(' › ').length).toBeLessThanOrEqual(40);
  });

  it('keeps a parent that is longer than the whole budget', () => {
    const { visible } = truncatePathLeft(
      ['Space', 'A parent page with a very long descriptive title indeed'],
      10
    );

    expect(visible).toEqual([
      'A parent page with a very long descriptive title indeed',
    ]);
  });

  it('has nothing to show for a space', () => {
    expect(truncatePathLeft([], 40)).toEqual({ visible: [], hiddenCount: 0 });
  });

  it('counts an emoji as one character', () => {
    // 11 code points but 12 UTF-16 units: it must still fit in 11.
    expect(truncatePathLeft(['🚀 Missions'], 11).hiddenCount).toBe(0);
  });
});

describe('segmentLabel', () => {
  it('names a nameless ancestor instead of leaving a blank', () => {
    expect(segmentLabel({ name: null })).toBe('Untitled');
    expect(segmentLabel({ name: '   ' })).toBe('Untitled');
    expect(segmentLabel({ name: ' GPS ' })).toBe('GPS');
  });
});

describe('formatPath', () => {
  it('joins with the breadcrumb separator', () => {
    expect(formatPath(['A', 'B'])).toBe('A › B');
  });
});
