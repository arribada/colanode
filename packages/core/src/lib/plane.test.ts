import { describe, expect, it } from 'vitest';

import { buildPlaneIssueUrl, parsePlaneIssueUrl } from './plane';

const PROJECT_ID = 'b61cf34b-593a-4fe4-836e-743e03fb2b59';
const ISSUE_ID = '8758bff6-b0cf-45f0-af1f-7502d2e6c57f';
const VALID_URL = `https://plane.arribada.org/arribada/projects/${PROJECT_ID}/issues/${ISSUE_ID}`;

describe('parsePlaneIssueUrl', () => {
  it('parses a well-formed Plane issue URL', () => {
    expect(parsePlaneIssueUrl(VALID_URL)).toEqual({
      workspaceSlug: 'arribada',
      projectId: PROJECT_ID,
      issueId: ISSUE_ID,
    });
  });

  it('ignores a trailing slash', () => {
    expect(parsePlaneIssueUrl(`${VALID_URL}/`)).toEqual({
      workspaceSlug: 'arribada',
      projectId: PROJECT_ID,
      issueId: ISSUE_ID,
    });
  });

  it('ignores a query string and hash', () => {
    expect(parsePlaneIssueUrl(`${VALID_URL}?board=true#comments`)).toEqual({
      workspaceSlug: 'arribada',
      projectId: PROJECT_ID,
      issueId: ISSUE_ID,
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parsePlaneIssueUrl(`  ${VALID_URL}  `)).toEqual({
      workspaceSlug: 'arribada',
      projectId: PROJECT_ID,
      issueId: ISSUE_ID,
    });
  });

  it('is host-agnostic (only the path shape matters)', () => {
    const url = `https://plane.example.com/arribada/projects/${PROJECT_ID}/issues/${ISSUE_ID}`;
    expect(parsePlaneIssueUrl(url)).toEqual({
      workspaceSlug: 'arribada',
      projectId: PROJECT_ID,
      issueId: ISSUE_ID,
    });
  });

  it('returns null for an empty or blank string', () => {
    expect(parsePlaneIssueUrl('')).toBeNull();
    expect(parsePlaneIssueUrl('   ')).toBeNull();
  });

  it('returns null for a non-URL string', () => {
    expect(parsePlaneIssueUrl('not a url')).toBeNull();
  });

  it('returns null for a non-http(s) protocol', () => {
    expect(
      parsePlaneIssueUrl(
        `ftp://plane.arribada.org/arribada/projects/${PROJECT_ID}/issues/${ISSUE_ID}`
      )
    ).toBeNull();
  });

  it('returns null when the "projects" literal is missing', () => {
    expect(
      parsePlaneIssueUrl(
        `https://plane.arribada.org/arribada/${PROJECT_ID}/issues/${ISSUE_ID}`
      )
    ).toBeNull();
  });

  it('returns null when the "issues" literal is missing', () => {
    expect(
      parsePlaneIssueUrl(
        `https://plane.arribada.org/arribada/projects/${PROJECT_ID}/${ISSUE_ID}`
      )
    ).toBeNull();
  });

  it('returns null when the project id is not a UUID', () => {
    expect(
      parsePlaneIssueUrl(
        `https://plane.arribada.org/arribada/projects/not-a-uuid/issues/${ISSUE_ID}`
      )
    ).toBeNull();
  });

  it('returns null when the issue id is not a UUID', () => {
    expect(
      parsePlaneIssueUrl(
        `https://plane.arribada.org/arribada/projects/${PROJECT_ID}/issues/not-a-uuid`
      )
    ).toBeNull();
  });

  it('returns null for a different Plane link shape (project home, not an issue)', () => {
    expect(
      parsePlaneIssueUrl(
        `https://plane.arribada.org/arribada/projects/${PROJECT_ID}/issues`
      )
    ).toBeNull();
  });

  it('returns null for an unrelated URL', () => {
    expect(parsePlaneIssueUrl('https://example.com/')).toBeNull();
  });
});

describe('buildPlaneIssueUrl', () => {
  it('builds the canonical issue URL from its parts', () => {
    const url = buildPlaneIssueUrl('https://plane.arribada.org', {
      workspaceSlug: 'arribada',
      projectId: PROJECT_ID,
      issueId: ISSUE_ID,
    });

    expect(url).toBe(VALID_URL);
  });

  it('strips a trailing slash from the base URL', () => {
    const url = buildPlaneIssueUrl('https://plane.arribada.org/', {
      workspaceSlug: 'arribada',
      projectId: PROJECT_ID,
      issueId: ISSUE_ID,
    });

    expect(url).toBe(VALID_URL);
  });

  it('round-trips with parsePlaneIssueUrl', () => {
    const parts = parsePlaneIssueUrl(VALID_URL);
    expect(parts).not.toBeNull();
    expect(buildPlaneIssueUrl('https://plane.arribada.org', parts!)).toBe(
      VALID_URL
    );
  });
});
