import { describe, expect, it } from 'vitest';

import {
  PROJECT_ROLES,
  PROJECT_TEMPLATE_PAGES,
  getProjectLane,
  isValidProjectCode,
  matchProjectRoles,
  normalizeProjectCode,
  normalizeProjectPageName,
  suggestProjectCode,
} from './project-template';

const pages = (...names: string[]) =>
  names.map((name, i) => ({ id: `p${i}`, name }));

describe('PROJECT_TEMPLATE_PAGES', () => {
  it('has one page per role, in the order of the conventions page', () => {
    expect(PROJECT_TEMPLATE_PAGES.map((page) => page.role)).toEqual([
      ...PROJECT_ROLES,
    ]);
    expect(PROJECT_TEMPLATE_PAGES.map((page) => page.name)).toEqual([
      'Overview',
      'Requirements',
      'Use cases',
      'Specifications',
      'Hardware design',
      'Firmware and software design',
      'Tests and validation',
      'Bill of materials',
      'Decisions and ADR',
      'Procurement and manufacturing',
      'Roadmap',
      'Partners and funding',
      'References',
    ]);
  });
});

describe('normalizeProjectPageName', () => {
  it('drops emoji, numeric prefixes, case and punctuation', () => {
    expect(normalizeProjectPageName('🧭 70 - Decisions / ADR')).toBe(
      'decisions adr'
    );
    expect(normalizeProjectPageName('10 - Requirements')).toBe('requirements');
    expect(normalizeProjectPageName('  Use  Cases ')).toBe('use cases');
  });
});

describe('matchProjectRoles', () => {
  it('matches the canonical titles of a conforming project', () => {
    const matches = matchProjectRoles(
      pages(...PROJECT_TEMPLATE_PAGES.map((page) => page.name))
    );
    expect(matches).toHaveLength(PROJECT_ROLES.length);
    expect(matches.every((match) => match.via === 'name')).toBe(true);
  });

  it('falls back to an alias only when the canonical title is absent', () => {
    const matches = matchProjectRoles(
      pages('Requirements and use cases', 'Partners and stakeholders', 'Guide')
    );
    expect(matches).toEqual([
      { pageId: 'p0', role: 'requirements', via: 'alias' },
      { pageId: 'p1', role: 'partners', via: 'alias' },
    ]);
  });

  it('prefers the canonical page over an alias page for the same role', () => {
    const matches = matchProjectRoles(
      pages('Requirements and use cases', 'Requirements')
    );
    expect(matches).toEqual([
      { pageId: 'p1', role: 'requirements', via: 'name' },
    ]);
  });

  it('gives a page at most one role', () => {
    const matches = matchProjectRoles(pages('Decisions and ADR', 'ADR'));
    expect(matches).toEqual([{ pageId: 'p0', role: 'decisions', via: 'name' }]);
  });

  it('leaves project-specific pages without a role', () => {
    expect(matchProjectRoles(pages('Power budget', 'HV stage'))).toEqual([]);
  });
});

describe('getProjectLane', () => {
  it('places roles in their lane and unknown pages in design', () => {
    expect(getProjectLane('requirements')).toBe('requirements');
    expect(getProjectLane('tests')).toBe('verification');
    expect(getProjectLane('decisions')).toBe('decisions');
    expect(getProjectLane(null)).toBe('design');
    expect(getProjectLane('not-a-role')).toBe('design');
  });
});

describe('project codes', () => {
  it('accepts 2 to 10 capital letters only', () => {
    expect(isValidProjectCode('MARLIN')).toBe(true);
    expect(isValidProjectCode('OP')).toBe(true);
    expect(isValidProjectCode('M')).toBe(false);
    expect(isValidProjectCode('ABCDEFGHIJK')).toBe(false);
    expect(isValidProjectCode('STU-T')).toBe(false);
    expect(isValidProjectCode('360')).toBe(false);
    expect(isValidProjectCode('marlin')).toBe(false);
  });

  it('normalizes typed input to a code', () => {
    expect(normalizeProjectCode('stu-t')).toBe('STUT');
    expect(normalizeProjectCode('Príncipe 2')).toBe('PRINCIPE');
  });

  it('suggests a code from the project name', () => {
    expect(suggestProjectCode('MARLIN')).toBe('MARLIN');
    expect(suggestProjectCode('Penguin Camera')).toBe('PENGCAM');
    expect(suggestProjectCode('Lobster Pot Cellular Tracking')).toBe('LPCT');
    expect(suggestProjectCode('Sea Turtle Tag GPS')).toBe('STTG');
    expect(suggestProjectCode('')).toBe('');
    expect(isValidProjectCode(suggestProjectCode('Arribada Clubs'))).toBe(true);
  });
});
