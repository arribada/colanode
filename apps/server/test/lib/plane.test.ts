import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlaneIssueUrlParts } from '@colanode/core';
import type { EnabledPlaneConfig } from '@colanode/server/lib/config/plane';
import {
  __clearPlaneIssueCacheForTests,
  fetchPlaneIssue,
} from '@colanode/server/lib/plane';

// `vi.mock`/`vi.hoisted` calls are hoisted by vitest above every import in
// this file regardless of where they're written textually, so it's safe for
// them to appear after the import of the module under test — see
// https://vitest.dev/api/vi.html#vi-hoisted.
const { mockGet, mockCreate, MockHTTPError } = vi.hoisted(() => {
  class MockHTTPError extends Error {
    response: { status: number };
    constructor(status: number) {
      super(`HTTP ${status}`);
      this.response = { status };
    }
  }

  const mockGet = vi.fn();
  const mockCreate = vi.fn(() => ({ get: mockGet }));

  return { mockGet, mockCreate, MockHTTPError };
});

vi.mock('ky', () => ({
  default: { create: mockCreate },
  HTTPError: MockHTTPError,
}));

const baseConfig: EnabledPlaneConfig = {
  enabled: true,
  apiBase: 'https://plane.arribada.org',
  apiToken: 'test-token',
  workspaceSlug: 'arribada',
  cacheTtlMs: 60_000,
  requestTimeoutMs: 10_000,
};

const parts: PlaneIssueUrlParts = {
  workspaceSlug: 'arribada',
  projectId: 'b61cf34b-593a-4fe4-836e-743e03fb2b59',
  issueId: '8758bff6-b0cf-45f0-af1f-7502d2e6c57f',
};

const rawIssue = {
  id: parts.issueId,
  name: 'Database Work',
  sequence_id: 475,
  priority: 'none',
  state: 'cd451aee-0a9b-411b-9c4e-7ffa9c685d46',
};

const rawProject = { identifier: 'MARLIN' };
const rawState = { name: 'Todo', color: '#3B82F6', group: 'unstarted' };

const defaultGetImplementation = (url: string) => {
  if (url.includes('/issues/')) {
    return { json: () => Promise.resolve(rawIssue) };
  }
  if (url.includes('/states/')) {
    return { json: () => Promise.resolve(rawState) };
  }
  return { json: () => Promise.resolve(rawProject) };
};

beforeEach(() => {
  mockGet.mockReset();
  mockCreate.mockClear();
  mockGet.mockImplementation(defaultGetImplementation);
  __clearPlaneIssueCacheForTests();
});

describe('fetchPlaneIssue', () => {
  it('rejects a URL for a workspace other than the configured one, without any network call', async () => {
    const result = await fetchPlaneIssue(baseConfig, {
      ...parts,
      workspaceSlug: 'some-other-workspace',
    });

    expect(result).toEqual({ ok: false, reason: 'workspace_mismatch' });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('fetches and assembles the issue/project/state into a display projection', async () => {
    const result = await fetchPlaneIssue(baseConfig, parts);

    if (!result.ok) {
      throw new Error(`expected ok result, got reason: ${result.reason}`);
    }

    expect(result.issue).toMatchObject({
      id: parts.issueId,
      projectId: parts.projectId,
      identifier: 'MARLIN-475',
      sequenceId: 475,
      name: 'Database Work',
      priority: 'none',
      state: { name: 'Todo', color: '#3B82F6', group: 'unstarted' },
      url: `https://plane.arribada.org/arribada/projects/${parts.projectId}/issues/${parts.issueId}`,
      cachedAt: null,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'X-API-Key': 'test-token' },
      })
    );
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('caches a successful fetch and serves the cache on the next call within the TTL', async () => {
    const first = await fetchPlaneIssue(baseConfig, parts);
    expect(first.ok).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(3);

    const second = await fetchPlaneIssue(baseConfig, parts);
    if (!second.ok) {
      throw new Error(`expected ok result, got reason: ${second.reason}`);
    }

    // Still 3 total calls — the second fetchPlaneIssue was served from
    // cache, so no additional network calls were made.
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(second.issue.cachedAt).not.toBeNull();
  });

  it('refetches once the cache entry has expired', async () => {
    const shortTtlConfig: EnabledPlaneConfig = { ...baseConfig, cacheTtlMs: 1 };

    const first = await fetchPlaneIssue(shortTtlConfig, parts);
    expect(first.ok).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(3);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = await fetchPlaneIssue(shortTtlConfig, parts);
    expect(second.ok).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(6);
  });

  it('maps a 404 from Plane to a "not_found" result', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/issues/')) {
        return { json: () => Promise.reject(new MockHTTPError(404)) };
      }
      return defaultGetImplementation(url);
    });

    const result = await fetchPlaneIssue(baseConfig, parts);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('maps a non-404 failure to a generic "fetch_failed" result', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/issues/')) {
        return { json: () => Promise.reject(new Error('network error')) };
      }
      return defaultGetImplementation(url);
    });

    const result = await fetchPlaneIssue(baseConfig, parts);
    expect(result).toEqual({ ok: false, reason: 'fetch_failed' });
  });

  it('maps a non-404 HTTPError to a generic "fetch_failed" result', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/issues/')) {
        return { json: () => Promise.reject(new MockHTTPError(500)) };
      }
      return defaultGetImplementation(url);
    });

    const result = await fetchPlaneIssue(baseConfig, parts);
    expect(result).toEqual({ ok: false, reason: 'fetch_failed' });
  });
});
