import { z } from 'zod/v4';

// Inputs and outputs of the project template routes
// (/client/v1/workspaces/:workspaceId/projects, apps/server/src/lib/projects).

export const projectPlaneModeSchema = z.enum(['create', 'link', 'none']);

export type ProjectPlaneMode = z.infer<typeof projectPlaneModeSchema>;

export const planeProjectLinkSchema = z.object({
  projectId: z.string(),
  identifier: z.string(),
  name: z.string(),
  url: z.string(),
  wikiNodeId: z.string().nullable(),
  archived: z.boolean(),
});

export type PlaneProjectLinkOutput = z.infer<typeof planeProjectLinkSchema>;

// Where the code stands on Plane: no link configured, Plane not answering,
// no project with that identifier, one that is free to link, one already
// linked to this project, or one linked to another wiki page.
export const projectPlaneStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('disabled') }),
  z.object({ state: z.literal('unreachable') }),
  z.object({ state: z.literal('absent') }),
  z.object({ state: z.literal('free'), project: planeProjectLinkSchema }),
  z.object({ state: z.literal('linked'), project: planeProjectLinkSchema }),
  z.object({
    state: z.literal('linked_elsewhere'),
    project: planeProjectLinkSchema,
  }),
]);

export type ProjectPlaneStatus = z.infer<typeof projectPlaneStatusSchema>;

export const projectParentSchema = z.object({
  id: z.string(),
  // The space the projects live in; the "New project" entry only shows there.
  spaceId: z.string(),
  name: z.string(),
  depth: z.number(),
  path: z.string(),
});

export type ProjectParent = z.infer<typeof projectParentSchema>;

export const projectParentsOutputSchema = z.array(projectParentSchema);

export const projectCodeCheckOutputSchema = z.object({
  valid: z.boolean(),
  wiki: z
    .object({
      pageId: z.string(),
      parentId: z.string().nullable(),
      name: z.string(),
      code: z.string(),
    })
    .nullable(),
  plane: projectPlaneStatusSchema,
});

export type ProjectCodeCheckOutput = z.infer<
  typeof projectCodeCheckOutputSchema
>;

export const projectCreateInputSchema = z.object({
  parentId: z.string(),
  name: z.string().min(1).max(200),
  code: z.string().min(2).max(10),
  plane: projectPlaneModeSchema,
});

export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;

export const projectCreateOutputSchema = z.object({
  rootId: z.string(),
  overviewId: z.string(),
  pageIds: z.record(z.string(), z.string()),
  plane: planeProjectLinkSchema.nullable(),
});

export type ProjectCreateOutput = z.infer<typeof projectCreateOutputSchema>;

export const projectAlignInputSchema = z.object({
  pageId: z.string(),
  code: z.string().min(2).max(10),
  apply: z.boolean(),
  plane: projectPlaneModeSchema,
  aliases: z.array(z.string().max(200)).max(20).optional(),
  // Explicit roles by page id, over title matching; null = no role.
  roles: z.record(z.string(), z.string().nullable()).optional(),
  // Which missing template pages to add: all (default), none, or these roles.
  createMissing: z.union([z.boolean(), z.array(z.string())]).optional(),
});

export type ProjectAlignInput = z.infer<typeof projectAlignInputSchema>;

export const projectAlignPlanSchema = z.object({
  pageId: z.string(),
  name: z.string(),
  code: z.string(),
  roles: z.array(
    z.object({
      pageId: z.string(),
      name: z.string(),
      role: z.string(),
      via: z.enum(['name', 'alias', 'kept', 'set']),
    })
  ),
  create: z.array(z.object({ role: z.string(), name: z.string() })),
  registers: z.array(
    z.object({ pageId: z.string(), role: z.string(), name: z.string() })
  ),
  unmatched: z.array(z.object({ pageId: z.string(), name: z.string() })),
  clear: z.array(z.object({ pageId: z.string(), name: z.string() })),
  options: z.array(
    z.object({
      database: z.string(),
      databaseName: z.string(),
      action: z.enum(['exists', 'rename', 'add', 'missing_field']),
      from: z.string().optional(),
    })
  ),
  plane: projectPlaneStatusSchema,
});

export type ProjectAlignPlan = z.infer<typeof projectAlignPlanSchema>;

export const projectAlignOutputSchema = z.object({
  plan: projectAlignPlanSchema,
  applied: z.boolean(),
  plane: planeProjectLinkSchema.nullable(),
});

export type ProjectAlignOutput = z.infer<typeof projectAlignOutputSchema>;
