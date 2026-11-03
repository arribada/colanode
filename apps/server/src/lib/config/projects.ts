import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

// Config for the optional project template ("New project" / "Align with the
// project template", see apps/server/src/lib/projects). Off by default: a
// server without this section behaves exactly as before.
//
// The databases are named by id, not looked up by title, because a renamed
// database must not silently stop receiving its project's embed. Each one
// needs a select field called "Project" whose options are project codes.
//
// `linkSecret` is shared with the Plane fork, both ways: the wiki sends it
// when it asks Plane to create or link a project, and Plane sends it when it
// asks the wiki to create the pages of a Plane project. Supply it as
// `env://PROJECT_LINK_SECRET`, never inline.
export const projectsConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      workspaceId: z.string(),
      // The space that holds the missions, where new projects are offered.
      spaceId: z.string(),
      // The how-to page every template page links to.
      helpPageId: z.string().nullable().optional(),
      databases: z.object({
        requirements: z.string(),
        verification: z.string(),
        adr: z.string(),
        tasks: z.string().nullable().optional(),
        projects: z.string().nullable().optional(),
      }),
      linkSecret: z
        .string()
        .transform(resolveConfigReference)
        .nullable()
        .optional(),
      // Who the pages are created by when Plane asks for them and the Plane
      // user has no account on the wiki.
      serviceEmail: z.string().nullable().optional(),
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({
    enabled: false,
  });

export type ProjectsConfig = z.infer<typeof projectsConfigSchema>;
export type EnabledProjectsConfig = Extract<ProjectsConfig, { enabled: true }>;
