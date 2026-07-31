// Parsing helpers for Plane (plane.arribada.org) issue links. Shared between
// the server (proxy access-check + fetch) and the client (paste-handler that
// recognizes a pasted Plane issue URL and turns it into a rich chip).
//
// A Plane issue URL, as produced by the Plane web app, looks like:
//   https://plane.arribada.org/<workspaceSlug>/projects/<projectId>/issues/<issueId>
// `workspaceSlug` is the Plane workspace slug (not to be confused with a
// Colanode workspace id); `projectId`/`issueId` are Plane's UUIDs. We parse
// with the `URL` API (rather than a single monolithic regex) so a stray
// trailing slash, query string, or hash on the pasted link doesn't cause a
// false negative.

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface PlaneIssueUrlParts {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
}

/**
 * Parses a Plane issue URL into its workspace/project/issue parts. Returns
 * `null` if `input` isn't a well-formed absolute http(s) URL, or doesn't
 * match the `/<workspace>/projects/<projectId>/issues/<issueId>` shape.
 * Intentionally host-agnostic — the pasted link's host isn't used to decide
 * where to fetch from (that's always the configured `PLANE_API_BASE`); the
 * workspace slug is what callers should check against their own configured
 * workspace before trusting the rest of the URL.
 */
export const parsePlaneIssueUrl = (
  input: string
): PlaneIssueUrlParts | null => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const segments = url.pathname
    .split('/')
    .filter((segment) => segment.length > 0);

  if (segments.length !== 5) {
    return null;
  }

  const [workspaceSlug, projectsLiteral, projectId, issuesLiteral, issueId] =
    segments as [string, string, string, string, string];

  if (projectsLiteral !== 'projects' || issuesLiteral !== 'issues') {
    return null;
  }

  if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(issueId)) {
    return null;
  }

  return { workspaceSlug, projectId, issueId };
};

/** Builds the canonical Plane issue web URL from its parts (the inverse of
 * `parsePlaneIssueUrl`), used when the chip needs a link back to Plane. */
export const buildPlaneIssueUrl = (
  webBaseUrl: string,
  parts: PlaneIssueUrlParts
): string => {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/${parts.workspaceSlug}/projects/${parts.projectId}/issues/${parts.issueId}`;
};
