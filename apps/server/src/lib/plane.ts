import ky, { HTTPError } from 'ky';

import {
  buildPlaneIssueUrl,
  PlaneIssueOutput,
  PlaneIssueUrlParts,
  PlaneMyIssue,
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
  myIssuesCache.clear();
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

// ===========================================================================
// "My Plane tickets" (wiki home dashboard) — the current user's assigned
// issues across the workspace's projects. Same X-API-Key server-side proxy as
// the other fetchers. Identity is resolved server-side (the caller's email,
// looked up from the authenticated user row) and matched against the Plane
// workspace members, so this flow never trusts the client for identity.
// ===========================================================================

// A Plane workspace member. The members endpoint's exact shape has varied
// between Plane versions/forks, so we read every field that plausibly carries
// the member's email and their *user* id (the id that appears in an issue's
// `assignees`). Matching then compares an issue's assignees against the set of
// ALL candidate ids, so we don't depend on which one this fork actually uses.
interface RawPlaneMemberUser {
  id?: string;
  email?: string | null;
}

interface RawPlaneMember {
  id: string;
  email?: string | null;
  member?: RawPlaneMemberUser | string | null;
  member_id?: string | null;
}

// An issue as read for the "my issues" scan: the board issue's fields plus the
// assignee id list, read under either field name Plane has used (`assignees` /
// `assignee_ids`) — both arrays of *user* ids.
interface RawPlaneMyIssue {
  id: string;
  name: string;
  sequence_id: number;
  priority: string;
  state: string | null;
  assignees?: string[] | null;
  assignee_ids?: string[] | null;
}

interface MyIssuesCacheEntry {
  at: number;
  issues: PlaneMyIssue[];
}

// Keyed by lower-cased email. Reuses the same TTL as the other Plane caches.
const myIssuesCache = new Map<string, MyIssuesCacheEntry>();

// Bound the work: a self-hosted workspace has at most a few dozen projects,
// and this is a home-screen convenience, not an exhaustive issue browser.
const MY_ISSUES_MAX_PROJECTS = 40;
const MY_ISSUES_MAX_TOTAL = 100;

const readMemberEmail = (member: RawPlaneMember): string | undefined => {
  if (typeof member.email === 'string') {
    return member.email;
  }
  if (
    member.member &&
    typeof member.member === 'object' &&
    typeof member.member.email === 'string'
  ) {
    return member.member.email;
  }
  return undefined;
};

const collectMemberIds = (member: RawPlaneMember): Set<string> => {
  const ids = new Set<string>();
  if (typeof member.id === 'string') {
    ids.add(member.id);
  }
  if (typeof member.member === 'string') {
    ids.add(member.member);
  } else if (
    member.member &&
    typeof member.member === 'object' &&
    typeof member.member.id === 'string'
  ) {
    ids.add(member.member.id);
  }
  if (typeof member.member_id === 'string') {
    ids.add(member.member_id);
  }
  return ids;
};

export type FetchPlaneMyIssuesResult =
  | { ok: true; issues: PlaneMyIssue[] }
  | { ok: false; reason: 'fetch_failed' };

/**
 * Fetches the issues assigned to `email`'s Plane member, flattened across the
 * workspace's projects, for the home dashboard. Resolves the member from the
 * workspace members endpoint (case-insensitive email match); if no member
 * matches, returns an empty-but-ok result (the wiki user simply has no Plane
 * account — not an error). Per-process cached for `planeConfig.cacheTtlMs`,
 * keyed by email; failures use the same ok/reason shape as the other fetchers.
 */
export const fetchPlaneMyIssues = async (
  planeConfig: EnabledPlaneConfig,
  email: string
): Promise<FetchPlaneMyIssuesResult> => {
  const cacheKey = email.toLowerCase();
  const cached = myIssuesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < planeConfig.cacheTtlMs) {
    return { ok: true, issues: cached.issues };
  }

  const client = createPlaneClient(planeConfig);

  try {
    // The members endpoint has been seen returning either a bare array or the
    // standard paginated envelope; normalise both.
    const membersResponse = await client
      .get(buildApiUrl(planeConfig, 'members'))
      .json<RawPlaneMember[] | RawPlaneListEnvelope<RawPlaneMember>>();

    const members = Array.isArray(membersResponse)
      ? membersResponse
      : membersResponse.results;

    const target = email.toLowerCase();
    const member = members.find(
      (candidate) => readMemberEmail(candidate)?.toLowerCase() === target
    );

    // No Plane member for this wiki user — a normal state, cache it as empty.
    if (!member) {
      const empty: PlaneMyIssue[] = [];
      myIssuesCache.set(cacheKey, { at: Date.now(), issues: empty });
      return { ok: true, issues: empty };
    }

    const memberIds = collectMemberIds(member);

    const projectsResult = await fetchPlaneProjects(planeConfig);
    if (!projectsResult.ok) {
      return { ok: false, reason: 'fetch_failed' };
    }

    const projects = projectsResult.projects.slice(0, MY_ISSUES_MAX_PROJECTS);

    const perProject = await Promise.all(
      projects.map(async (project) => {
        const issuesEnvelope = await client
          .get(buildApiUrl(planeConfig, 'projects', project.id, 'issues'), {
            searchParams: { per_page: '100', order_by: '-updated_at' },
          })
          .json<RawPlaneListEnvelope<RawPlaneMyIssue>>();

        const mine = issuesEnvelope.results.filter((issue) => {
          const assignees = issue.assignees ?? issue.assignee_ids ?? [];
          return assignees.some((assigneeId) => memberIds.has(assigneeId));
        });

        if (mine.length === 0) {
          return [] as PlaneMyIssue[];
        }

        // Only projects the user actually has issues in pay for a states
        // fetch, which maps each issue's state id to its group (board column).
        const statesEnvelope = await client
          .get(buildApiUrl(planeConfig, 'projects', project.id, 'states'), {
            searchParams: { per_page: '100' },
          })
          .json<RawPlaneListEnvelope<RawPlaneBoardState>>();

        const stateGroupById = new Map(
          statesEnvelope.results.map((state): [string, string] => [
            state.id,
            state.group,
          ])
        );

        return mine.map<PlaneMyIssue>((issue) => ({
          key: `${project.identifier}-${issue.sequence_id}`,
          name: issue.name,
          url: buildPlaneIssueUrl(planeConfig.apiBase, {
            workspaceSlug: planeConfig.workspaceSlug,
            projectId: project.id,
            issueId: issue.id,
          }),
          projectName: project.name,
          priority: issue.priority,
          stateGroup:
            (issue.state ? stateGroupById.get(issue.state) : undefined) ??
            'unstarted',
        }));
      })
    );

    const issues = perProject.flat().slice(0, MY_ISSUES_MAX_TOTAL);

    myIssuesCache.set(cacheKey, { at: Date.now(), issues });
    return { ok: true, issues };
  } catch (error) {
    logger.error(
      toSafeLogFields(error),
      'Failed to fetch the assigned Plane issues from Plane API'
    );
    return { ok: false, reason: 'fetch_failed' };
  }
};
