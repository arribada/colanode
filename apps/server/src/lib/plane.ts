import ky, { HTTPError } from 'ky';

import {
  buildPlaneIssueUrl,
  PlaneIssueOutput,
  PlaneIssueUrlParts,
  PlaneProjectBoardOutput,
  PlaneProjectSummary,
} from '@colanode/core';
import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { EnabledPlaneConfig } from '@colanode/server/lib/config/plane';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('lib:plane');

// Raw shapes returned by Plane's REST API v1 (only the fields we use).
// Confirmed against a live arribada/plane fork:
// GET /api/v1/workspaces/:slug/projects/:projectId/issues/:issueId/
// GET /api/v1/workspaces/:slug/projects/:projectId/
// GET /api/v1/workspaces/:slug/projects/:projectId/states/:stateId/
interface RawPlaneIssue {
  id: string;
  name: string;
  sequence_id: number;
  priority: string;
  state: string;
}

interface RawPlaneProject {
  identifier: string;
}

interface RawPlaneState {
  name: string;
  color: string;
  group: string;
}

interface CacheEntry {
  at: number;
  issue: PlaneIssueOutput;
}

// In-memory, per-process cache keyed by "<projectId>:<issueId>". A self
// -hosted workspace's total number of distinct issues ever pasted into
// documents is expected to stay small, so nothing proactively evicts
// stale-but-cached entries beyond the TTL check on read.
const issueCache = new Map<string, CacheEntry>();

/** Test-only: clears the module-level cache so specs don't leak state. */
export const __clearPlaneIssueCacheForTests = (): void => {
  issueCache.clear();
};

export type FetchPlaneIssueResult =
  | { ok: true; issue: PlaneIssueOutput }
  | { ok: false; reason: 'workspace_mismatch' }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'fetch_failed' };

const buildApiUrl = (
  planeConfig: EnabledPlaneConfig,
  ...segments: string[]
): string => {
  const base = planeConfig.apiBase.replace(/\/+$/, '');
  const path = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .join('/');
  return `${base}/api/v1/workspaces/${planeConfig.workspaceSlug}/${path}/`;
};

/**
 * Resolves a parsed Plane issue URL to a small display projection (identifier
 * + title + state), fetched from the Plane REST API and cached in memory for
 * `planeConfig.cacheTtlMs`. Returns a discriminated result rather than
 * throwing so the route handler can map each failure mode to the right HTTP
 * status without a try/catch of its own.
 *
 * Deliberately checks `parts.workspaceSlug` against the configured
 * `planeConfig.workspaceSlug` up front — this integration is single
 * -workspace for v1, so a pasted link to a different Plane workspace is
 * rejected rather than silently fetched with the wrong workspace's token
 * scope.
 */
export const fetchPlaneIssue = async (
  planeConfig: EnabledPlaneConfig,
  parts: PlaneIssueUrlParts
): Promise<FetchPlaneIssueResult> => {
  if (parts.workspaceSlug !== planeConfig.workspaceSlug) {
    return { ok: false, reason: 'workspace_mismatch' };
  }

  const cacheKey = `${parts.projectId}:${parts.issueId}`;
  const cached = issueCache.get(cacheKey);
  if (cached && Date.now() - cached.at < planeConfig.cacheTtlMs) {
    return {
      ok: true,
      issue: {
        ...cached.issue,
        cachedAt: new Date(cached.at).toISOString(),
      },
    };
  }

  const client = ky.create({
    headers: { 'X-API-Key': planeConfig.apiToken },
    timeout: planeConfig.requestTimeoutMs,
  });

  try {
    const issue = await client
      .get(buildApiUrl(planeConfig, 'projects', parts.projectId, 'issues', parts.issueId))
      .json<RawPlaneIssue>();

    const [project, state] = await Promise.all([
      client
        .get(buildApiUrl(planeConfig, 'projects', parts.projectId))
        .json<RawPlaneProject>(),
      client
        .get(
          buildApiUrl(
            planeConfig,
            'projects',
            parts.projectId,
            'states',
            issue.state
          )
        )
        .json<RawPlaneState>(),
    ]);

    // Plane's own deployment for this fork serves the web app and the REST
    // API from the same host (nginx routes `/api/*` to the backend,
    // everything else to the frontend) — see the fetched issue's canonical
    // link derivation in `buildPlaneIssueUrl`. If that ever changes, add a
    // separate `webBase` to the config rather than assuming `apiBase` doubles
    // as the web origin.
    const output: PlaneIssueOutput = {
      id: issue.id,
      projectId: parts.projectId,
      identifier: `${project.identifier}-${issue.sequence_id}`,
      sequenceId: issue.sequence_id,
      name: issue.name,
      priority: issue.priority,
      state: {
        name: state.name,
        color: state.color,
        group: state.group,
      },
      url: buildPlaneIssueUrl(planeConfig.apiBase, parts),
      cachedAt: null,
    };

    issueCache.set(cacheKey, { at: Date.now(), issue: output });

    return { ok: true, issue: output };
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 404) {
      return { ok: false, reason: 'not_found' };
    }

    logger.error(
      toSafeLogFields(error),
      `Failed to fetch Plane issue ${parts.projectId}/${parts.issueId} from Plane API`
    );
    return { ok: false, reason: 'fetch_failed' };
  }
};

// ===========================================================================
// Native /plane project-embed block (Phase 1a)
//
// Two more read-only projections fetched through the same X-API-Key proxy as
// `fetchPlaneIssue` above: the project picker list, and a single project's
// board (states + issues, capped at one page). Both are cached per-process
// for `planeConfig.cacheTtlMs` so a board open in several documents at once
// doesn't hammer the Plane API.
// ===========================================================================

// Plane's list endpoints (projects / states / issues) all return this
// paginated envelope. Confirmed live: `total_count` is the project-wide
// total, `next_page_results` is true when more pages exist beyond the first.
interface RawPlaneListEnvelope<T> {
  results: T[];
  total_count?: number;
  next_page_results?: boolean;
}

interface RawPlaneProjectSummary {
  id: string;
  name: string;
  identifier: string;
}

interface RawPlaneBoardState {
  id: string;
  name: string;
  group: string;
  color: string;
}

interface RawPlaneBoardIssue {
  id: string;
  name: string;
  sequence_id: number;
  priority: string;
  state: string | null;
}

interface ProjectsCacheEntry {
  at: number;
  projects: PlaneProjectSummary[];
}

interface BoardCacheEntry {
  at: number;
  board: PlaneProjectBoardOutput;
}

// Keyed by workspace slug (there's only one configured workspace, so this is
// effectively a single-entry cache — kept a map for symmetry with the board
// cache and to survive a future multi-workspace config).
const projectsCache = new Map<string, ProjectsCacheEntry>();
// Keyed by Plane project id.
const boardCache = new Map<string, BoardCacheEntry>();

/** Test-only: clears the project/board caches so specs don't leak state. */
export const __clearPlaneProjectCachesForTests = (): void => {
  projectsCache.clear();
  boardCache.clear();
};

const createPlaneClient = (planeConfig: EnabledPlaneConfig) =>
  ky.create({
    headers: { 'X-API-Key': planeConfig.apiToken },
    timeout: planeConfig.requestTimeoutMs,
  });

export type FetchPlaneProjectsResult =
  | { ok: true; projects: PlaneProjectSummary[] }
  | { ok: false; reason: 'fetch_failed' };

/**
 * Lists the workspace's projects (id + name + identifier) for the /plane
 * block's project picker. Capped at one page of 100; a self-hosted workspace
 * with more than that is not expected, and the picker is a convenience, not a
 * full project browser.
 */
export const fetchPlaneProjects = async (
  planeConfig: EnabledPlaneConfig
): Promise<FetchPlaneProjectsResult> => {
  const cacheKey = planeConfig.workspaceSlug;
  const cached = projectsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < planeConfig.cacheTtlMs) {
    return { ok: true, projects: cached.projects };
  }

  const client = createPlaneClient(planeConfig);

  try {
    const envelope = await client
      .get(buildApiUrl(planeConfig, 'projects'), {
        searchParams: { per_page: '100' },
      })
      .json<RawPlaneListEnvelope<RawPlaneProjectSummary>>();

    const projects: PlaneProjectSummary[] = envelope.results.map((project) => ({
      id: project.id,
      name: project.name,
      identifier: project.identifier,
    }));

    projectsCache.set(cacheKey, { at: Date.now(), projects });
    return { ok: true, projects };
  } catch (error) {
    logger.error(
      toSafeLogFields(error),
      'Failed to fetch Plane projects list from Plane API'
    );
    return { ok: false, reason: 'fetch_failed' };
  }
};

export type FetchPlaneProjectBoardResult =
  | { ok: true; board: PlaneProjectBoardOutput }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'fetch_failed' };

/**
 * Fetches a single project's board projection: the project header, its
 * workflow states (board columns) and up to one page (100) of issues ordered
 * by most-recently-updated. Sets `truncated` when the project has more issues
 * than were returned.
 */
export const fetchPlaneProjectBoard = async (
  planeConfig: EnabledPlaneConfig,
  projectId: string
): Promise<FetchPlaneProjectBoardResult> => {
  const cached = boardCache.get(projectId);
  if (cached && Date.now() - cached.at < planeConfig.cacheTtlMs) {
    return { ok: true, board: cached.board };
  }

  const client = createPlaneClient(planeConfig);

  try {
    const [project, statesEnvelope, issuesEnvelope] = await Promise.all([
      client
        .get(buildApiUrl(planeConfig, 'projects', projectId))
        .json<RawPlaneProjectSummary>(),
      client
        .get(buildApiUrl(planeConfig, 'projects', projectId, 'states'), {
          searchParams: { per_page: '100' },
        })
        .json<RawPlaneListEnvelope<RawPlaneBoardState>>(),
      client
        .get(buildApiUrl(planeConfig, 'projects', projectId, 'issues'), {
          searchParams: { per_page: '100', order_by: '-updated_at' },
        })
        .json<RawPlaneListEnvelope<RawPlaneBoardIssue>>(),
    ]);

    const states = statesEnvelope.results.map((state) => ({
      id: state.id,
      name: state.name,
      group: state.group,
      color: state.color,
    }));

    const issues = issuesEnvelope.results.map((issue) => ({
      id: issue.id,
      key: `${project.identifier}-${issue.sequence_id}`,
      name: issue.name,
      stateId: issue.state ?? null,
      priority: issue.priority,
      url: buildPlaneIssueUrl(planeConfig.apiBase, {
        workspaceSlug: planeConfig.workspaceSlug,
        projectId,
        issueId: issue.id,
      }),
    }));

    const totalIssues = issuesEnvelope.total_count ?? issues.length;
    const webBase = planeConfig.apiBase.replace(/\/+$/, '');

    const board: PlaneProjectBoardOutput = {
      project: {
        id: project.id,
        name: project.name,
        identifier: project.identifier,
      },
      projectUrl: `${webBase}/${planeConfig.workspaceSlug}/projects/${projectId}/issues/`,
      states,
      issues,
      totalIssues,
      truncated:
        Boolean(issuesEnvelope.next_page_results) ||
        totalIssues > issues.length,
    };

    boardCache.set(projectId, { at: Date.now(), board });
    return { ok: true, board };
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 404) {
      return { ok: false, reason: 'not_found' };
    }

    logger.error(
      toSafeLogFields(error),
      `Failed to fetch Plane project board ${projectId} from Plane API`
    );
    return { ok: false, reason: 'fetch_failed' };
  }
};
