import { z } from 'zod/v4';

// Output shape for GET
// /client/v1/workspaces/:workspaceId/integrations/plane/issue?url=...
// A deliberately small projection of a Plane issue — just enough to render
// the inline chip (identifier + title + state). Not a full mirror of
// Plane's REST API issue shape.
export const planeIssueStateSchema = z.object({
  name: z.string(),
  color: z.string(),
  // Plane's own state grouping (backlog/unstarted/started/completed/cancelled).
  group: z.string(),
});

export type PlaneIssueState = z.infer<typeof planeIssueStateSchema>;

export const planeIssueOutputSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  // Human-readable identifier, e.g. "MARLIN-475" (project identifier +
  // sequence id), matching what Plane's own UI shows.
  identifier: z.string(),
  sequenceId: z.number(),
  name: z.string(),
  priority: z.string(),
  state: planeIssueStateSchema,
  // Canonical Plane web URL for the issue (may differ from the URL the user
  // originally pasted, e.g. if it omitted a trailing slash).
  url: z.string(),
  // Set when the response was served from the in-memory cache rather than a
  // fresh Plane API call.
  cachedAt: z.string().nullable(),
});

export type PlaneIssueOutput = z.infer<typeof planeIssueOutputSchema>;

// ---------------------------------------------------------------------------
// Native /plane project-embed block (Phase 1a) — a live project board/list
// rendered inside a wiki page. These are LIST projections fetched through the
// same server-side proxy as the issue chip, so the Plane API token never
// reaches the client. See:
//   apps/server/src/lib/plane.ts (fetchPlaneProjects / fetchPlaneProjectBoard)
//   apps/server/src/api/client/routes/workspaces/integrations/plane/*
// ---------------------------------------------------------------------------

// A single project in the picker list (GET .../integrations/plane/projects).
export const planeProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  // Short project key, e.g. "MARLIN" — combined with an issue sequence id it
  // forms the human key "MARLIN-474".
  identifier: z.string(),
});

export type PlaneProjectSummary = z.infer<typeof planeProjectSummarySchema>;

export const planeProjectsListOutputSchema = z.array(planeProjectSummarySchema);

export type PlaneProjectsListOutput = z.infer<
  typeof planeProjectsListOutputSchema
>;

// A board column (Plane workflow state). `group` is Plane's own grouping
// (backlog/unstarted/started/completed/cancelled) used to order the columns.
export const planeBoardStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string(),
  color: z.string(),
});

export type PlaneBoardState = z.infer<typeof planeBoardStateSchema>;

// A single card on the board.
export const planeBoardIssueSchema = z.object({
  id: z.string(),
  // Human key "IDENTIFIER-SEQ", e.g. "MARLIN-474".
  key: z.string(),
  name: z.string(),
  // References a `planeBoardStateSchema.id`; null if the issue has no state.
  stateId: z.string().nullable(),
  priority: z.string(),
  // Canonical Plane web URL for the issue.
  url: z.string(),
});

export type PlaneBoardIssue = z.infer<typeof planeBoardIssueSchema>;

// Output of GET .../integrations/plane/project/:projectId/board — enough to
// render a board grouped by state (or a flat list).
export const planeProjectBoardOutputSchema = z.object({
  project: planeProjectSummarySchema,
  // Canonical Plane web URL for the project's issue list ("open in Plane").
  projectUrl: z.string(),
  states: z.array(planeBoardStateSchema),
  issues: z.array(planeBoardIssueSchema),
  // Total issues in the project (may exceed `issues.length`).
  totalIssues: z.number(),
  // True when the project has more issues than were returned (capped at
  // per_page=100); the board then shows a truncation hint.
  truncated: z.boolean(),
});

export type PlaneProjectBoardOutput = z.infer<
  typeof planeProjectBoardOutputSchema
>;

// ---------------------------------------------------------------------------
// "My Plane tickets" (wiki home dashboard) — the current user's assigned Plane
// issues, flattened across projects. Resolved through the same server-side
// proxy as the board/list projections (see fetchPlaneMyIssues); the user's
// identity is resolved server-side and matched to a Plane member by email, so
// the client never supplies an email. See:
//   apps/server/src/lib/plane.ts (fetchPlaneMyIssues)
//   apps/server/src/api/client/routes/workspaces/integrations/plane/plane-my-issues.ts
// ---------------------------------------------------------------------------

// A single assigned issue as shown in the "My Plane tickets" home section.
export const planeMyIssueSchema = z.object({
  // Human key "IDENTIFIER-SEQ", e.g. "MARLIN-474".
  key: z.string(),
  name: z.string(),
  // Canonical Plane web URL for the issue ("open in Plane").
  url: z.string(),
  // The parent project's display name, for context in the row.
  projectName: z.string(),
  // Plane priority (urgent/high/medium/low/none).
  priority: z.string(),
  // Plane state grouping (backlog/unstarted/started/completed/cancelled).
  stateGroup: z.string(),
});

export type PlaneMyIssue = z.infer<typeof planeMyIssueSchema>;

export const planeMyIssuesOutputSchema = z.array(planeMyIssueSchema);

export type PlaneMyIssuesOutput = z.infer<typeof planeMyIssuesOutputSchema>;
