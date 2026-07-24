import ky, { HTTPError } from 'ky';

import {
  buildPlaneIssueUrl,
  PlaneIssueOutput,
  PlaneIssueUrlParts,
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
