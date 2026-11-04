import { describe, expect, it } from 'vitest';

import { ProjectAlignPlan } from '@colanode/core';

import { describeAlignPlan, planeChoices, resolvePlaneMode } from './projects';

const project = {
  projectId: 'p1',
  identifier: 'MARLIN',
  name: 'MARLIN',
  url: 'https://plane.arribada.org/arribada/projects/p1/issues',
  wikiNodeId: null,
  archived: false,
};

describe('planeChoices', () => {
  it('offers nothing before Plane has answered', () => {
    expect(planeChoices(undefined)).toEqual([]);
  });

  it('preselects creating the Plane project when the code is free there', () => {
    expect(planeChoices({ state: 'absent' }).map((c) => c.mode)).toEqual([
      'create',
      'none',
    ]);
  });

  it('preselects linking when Plane already has the code with no wiki page', () => {
    expect(planeChoices({ state: 'free', project }).map((c) => c.mode)).toEqual(
      ['link', 'none']
    );
  });

  it('never offers to create or link a code another wiki page holds', () => {
    expect(
      planeChoices({
        state: 'linked_elsewhere',
        project: { ...project, wikiNodeId: 'other' },
      }).map((c) => c.mode)
    ).toEqual(['none']);
  });

  it('falls back to no Plane project when Plane is out of reach', () => {
    expect(planeChoices({ state: 'unreachable' }).map((c) => c.mode)).toEqual([
      'none',
    ]);
    expect(planeChoices({ state: 'disabled' }).map((c) => c.mode)).toEqual([
      'none',
    ]);
  });
});

describe('describeAlignPlan', () => {
  const plan: ProjectAlignPlan = {
    pageId: 'root',
    name: 'Rewild Cyprus',
    code: 'REWLD',
    roles: [
      { pageId: 'a', name: 'Overview', role: 'overview', via: 'name' },
      {
        pageId: 'b',
        name: 'Requirements and use cases',
        role: 'requirements',
        via: 'alias',
      },
      { pageId: 'c', name: 'Roadmap', role: 'roadmap', via: 'kept' },
    ],
    create: [{ role: 'tests', name: 'Tests and validation' }],
    registers: [
      { pageId: 'b', role: 'requirements', name: 'Requirements and use cases' },
    ],
    unmatched: [{ pageId: 'd', name: 'Guide' }],
    clear: [{ pageId: 'e', name: 'Old tests' }],
    options: [
      {
        database: 'adr',
        databaseName: '🧭 ADR',
        action: 'rename',
        from: 'Rewild Cyprus',
      },
      {
        database: 'requirements',
        databaseName: '📐 Requirements',
        action: 'add',
      },
      { database: 'tasks', databaseName: '📋 Project Tasks', action: 'exists' },
    ],
    plane: {
      state: 'free',
      project: { ...project, identifier: 'REWLD', name: 'Rewild Cyprus' },
    },
  };

  it('lists every change, and nothing for what stays as it is', () => {
    expect(describeAlignPlan(plan)).toEqual([
      '"Overview" becomes the Overview page',
      '"Requirements and use cases" becomes the Requirements page (similar title)',
      '"Old tests" stops being a template page',
      'Add the missing page "Tests and validation"',
      'Add the Requirements register at the top of "Requirements and use cases"',
      '🧭 ADR: rename the option "Rewild Cyprus" to REWLD',
      '📐 Requirements: add the option REWLD',
      'Link the Plane project "Rewild Cyprus"',
    ]);
  });
});

describe('resolvePlaneMode', () => {
  const absent = planeChoices({ state: 'absent' });

  it('preselects the first choice', () => {
    expect(resolvePlaneMode(null, 'ZZMT', absent)).toBe('create');
  });

  it('keeps the pick when Plane answers again for the same code', () => {
    const pick = { code: 'ZZMT', mode: 'none' as const };
    // A refetch builds a new, equal list: the pick must survive it.
    expect(
      resolvePlaneMode(pick, 'ZZMT', planeChoices({ state: 'absent' }))
    ).toBe('none');
  });

  it('drops the pick when the code changes', () => {
    const pick = { code: 'ZZMT', mode: 'none' as const };
    expect(resolvePlaneMode(pick, 'ZZMX', absent)).toBe('create');
  });

  it('drops a pick that is no longer offered', () => {
    const linked = planeChoices({ state: 'linked', project });
    expect(
      resolvePlaneMode({ code: 'MARLIN', mode: 'none' }, 'MARLIN', linked)
    ).toBe('link');
  });

  it('has nothing to choose before Plane answers', () => {
    expect(resolvePlaneMode(null, 'ZZMT', [])).toBeNull();
  });
});
