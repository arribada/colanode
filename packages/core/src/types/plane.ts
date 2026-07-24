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
