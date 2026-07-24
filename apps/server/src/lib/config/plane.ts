import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

// Config for the (optional, off-by-default) Plane issue-link integration —
// lets a document/message chip resolve a pasted Plane issue URL
// (https://plane.arribada.org/<workspace>/projects/<projectId>/issues/<issueId>)
// to its live identifier/title/state via a server-side proxy, so the Plane
// API token never reaches the client. See
// `apps/server/src/lib/plane.ts` and
// `apps/server/src/api/client/routes/workspaces/integrations/plane`.
//
// `apiToken` should be supplied via `env://PLANE_API_TOKEN` (or
// `file://...`) in the JSON config — never inline — same convention as
// every other secret in this config tree (see `resolveConfigReference`).
export const planeConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      apiBase: z
        .string({
          error: 'Plane API base URL is required when the integration is enabled.',
        })
        .transform(resolveConfigReference),
      apiToken: z
        .string({
          error: 'Plane API token is required when the integration is enabled.',
        })
        .transform(resolveConfigReference),
      workspaceSlug: z.string({
        error: 'Plane workspace slug is required when the integration is enabled.',
      }),
      // How long a fetched issue is served from the in-memory cache before a
      // fresh request is required. Keeps a chip that's open in several
      // documents at once from hammering the Plane API.
      cacheTtlMs: z.coerce.number().default(60_000),
      requestTimeoutMs: z.coerce.number().default(10_000),
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({
    enabled: false,
  });

export type PlaneConfig = z.infer<typeof planeConfigSchema>;
export type EnabledPlaneConfig = Extract<PlaneConfig, { enabled: true }>;
