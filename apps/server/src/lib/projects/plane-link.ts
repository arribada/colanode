// The wiki's side of the project link with the Plane fork: list the Plane
// projects with their identifier and wiki link, and create a Plane project
// (or link an existing one) for a wiki project.
//
// These calls go to the fork's own endpoints (/api/arribada/.../wiki-projects/),
// authenticated by the secret both servers share, not to Plane's public API:
// the public API cannot write the wiki link, and its project creation fails
// half-way when a project lead is passed (it leaves a project without its
// states). Redirects are refused so the secret is only ever sent to apiBase.

import { EnabledPlaneConfig } from '@colanode/server/lib/config/plane';

export type PlaneProjectLink = {
  projectId: string;
  identifier: string;
  name: string;
  url: string;
  // The wiki node the project points to (its Overview page), if any.
  wikiNodeId: string | null;
  archived: boolean;
};

type PlaneProjectLinkPayload = {
  project_id: string;
  identifier: string;
  name: string;
  url: string;
  wiki_node_id: string | null;
  archived: boolean;
};

const mapLink = (payload: PlaneProjectLinkPayload): PlaneProjectLink => ({
  projectId: payload.project_id,
  identifier: payload.identifier,
  name: payload.name,
  url: payload.url,
  wikiNodeId: payload.wiki_node_id,
  archived: payload.archived,
});

const endpoint = (cfg: EnabledPlaneConfig): string =>
  `${cfg.apiBase.replace(/\/+$/, '')}/api/arribada/workspaces/${encodeURIComponent(
    cfg.workspaceSlug
  )}/wiki-projects/`;

export type PlaneLinkResult<T> =
  { ok: true; value: T } | { ok: false; status: number; error: string };

const call = async <T>(
  cfg: EnabledPlaneConfig,
  secret: string,
  init: { method: 'GET' | 'POST'; body?: unknown }
): Promise<PlaneLinkResult<T>> => {
  try {
    const response = await fetch(endpoint(cfg), {
      method: init.method,
      headers: {
        'X-Wiki-Secret': secret,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });

    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const error =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: unknown }).error)
          : `http_${response.status}`;
      return { ok: false, status: response.status, error };
    }

    return { ok: true, value: json as T };
  } catch {
    return { ok: false, status: 502, error: 'plane_unreachable' };
  }
};

export const listPlaneProjectLinks = async (
  cfg: EnabledPlaneConfig,
  secret: string
): Promise<PlaneLinkResult<PlaneProjectLink[]>> => {
  const result = await call<{ projects: PlaneProjectLinkPayload[] }>(
    cfg,
    secret,
    { method: 'GET' }
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: (result.value.projects ?? []).map(mapLink) };
};

export type PlaneProjectLinkInput = {
  // 'create' makes a new Plane project with this identifier; 'link' points
  // the existing project with this identifier at the wiki.
  mode: 'create' | 'link';
  identifier: string;
  name: string;
  wikiNodeId: string;
  wikiTitle: string;
  // The person asking, so the Plane project is created by them when they
  // have a Plane account.
  actorEmail: string | null;
};

export const createOrLinkPlaneProject = async (
  cfg: EnabledPlaneConfig,
  secret: string,
  input: PlaneProjectLinkInput
): Promise<PlaneLinkResult<PlaneProjectLink>> => {
  const result = await call<{ project: PlaneProjectLinkPayload }>(cfg, secret, {
    method: 'POST',
    body: {
      mode: input.mode,
      identifier: input.identifier,
      name: input.name,
      wiki_node_id: input.wikiNodeId,
      wiki_title: input.wikiTitle,
      actor_email: input.actorEmail,
    },
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: mapLink(result.value.project) };
};
