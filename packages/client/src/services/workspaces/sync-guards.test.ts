import { describe, expect, it } from 'vitest';

import {
  computeHealCursor,
  isNewerRevision,
  isStaleCollaboration,
  shouldBlockResurrection,
} from '@colanode/client/services/workspaces/sync-guards';

describe('shouldBlockResurrection', () => {
  const update = { revision: '100', rootId: 'rootA' };

  it('blocks when a same-root tombstone is newer than the update', () => {
    expect(
      shouldBlockResurrection({ revision: '150', root_id: 'rootA' }, update)
    ).toBe(true);
  });
  it('allows a cross-space move (tombstone in a DIFFERENT root)', () => {
    expect(
      shouldBlockResurrection({ revision: '150', root_id: 'rootB' }, update)
    ).toBe(false);
  });
  it('allows when the tombstone is older than the update (a restore)', () => {
    expect(
      shouldBlockResurrection({ revision: '50', root_id: 'rootA' }, update)
    ).toBe(false);
  });
  it('allows on an equal revision (no strict-newer delete)', () => {
    expect(
      shouldBlockResurrection({ revision: '100', root_id: 'rootA' }, update)
    ).toBe(false);
  });
  it('allows when there is no tombstone', () => {
    expect(shouldBlockResurrection(null, update)).toBe(false);
    expect(shouldBlockResurrection(undefined, update)).toBe(false);
  });
  it('compares numerically, not lexically (9 vs 10)', () => {
    expect(
      shouldBlockResurrection({ revision: '10', root_id: 'rootA' }, {
        revision: '9',
        rootId: 'rootA',
      })
    ).toBe(true);
  });
});

describe('isNewerRevision (metadata advance)', () => {
  it('advances only for a strictly newer update', () => {
    expect(isNewerRevision('101', '100')).toBe(true);
    expect(isNewerRevision('100', '100')).toBe(false);
    expect(isNewerRevision('99', '100')).toBe(false);
  });
  it('is numeric, not lexical', () => {
    expect(isNewerRevision('100', '99')).toBe(true);
  });
});

describe('isStaleCollaboration', () => {
  it('is stale for an older or equal revision', () => {
    expect(isStaleCollaboration('100', '90')).toBe(true);
    expect(isStaleCollaboration('100', '100')).toBe(true);
  });
  it('is fresh for a strictly newer revision', () => {
    expect(isStaleCollaboration('100', '101')).toBe(false);
  });
  it('is fresh when nothing is held yet', () => {
    expect(isStaleCollaboration(null, '1')).toBe(false);
    expect(isStaleCollaboration(undefined, '1')).toBe(false);
  });
  it('is numeric, not lexical (does not treat "9" >= "100")', () => {
    expect(isStaleCollaboration('9', '100')).toBe(false);
  });
});

describe('computeHealCursor', () => {
  it('rewinds by the lookback window', () => {
    expect(computeHealCursor(500n, 200n)).toBe(300n);
  });
  it('never goes below zero', () => {
    expect(computeHealCursor(150n, 200n)).toBe(0n);
    expect(computeHealCursor(200n, 200n)).toBe(0n);
  });
});
