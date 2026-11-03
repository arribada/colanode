// Creating a project from the template, and aligning an existing project on
// it. One implementation for both callers: the wiki's "New project" dialog
// and Plane's "Create the wiki project" button (through the secret-checked
// link route).
//
// A project that follows the template is a page carrying `projectCode`,
// whose child pages carry `projectRole`. The code is the project's identifier
// on both tools: the same letters as the Plane identifier. Every database of
// the template has a "Project" select whose option for the project is named
// with that code, so a register embedded on a project page is a filter on
// that option.
//
// Aligning never deletes, moves or renames a page. It sets the code and the
// roles, adds the template pages the project lacks, adds the registers to
// the pages that lack them, and renames the project's existing select
// options to its code (keeping their ids, so no record loses its project).

import { sql } from 'kysely';

import {
  Block,
  CanCreateNodeContext,
  compareString,
  DatabaseAttributes,
  DocumentContent,
  FieldAttributes,
  FieldValue,
  generateFractionalIndex,
  generateId,
  getNodeModel,
  hasNodeRole,
  IdType,
  isProjectRole,
  isValidProjectCode,
  matchProjectRoles,
  normalizeProjectCode,
  normalizeProjectPageName,
  PageAttributes,
  PROJECT_TEMPLATE_PAGES,
  ProjectRole,
  RecordAttributes,
  RichTextContent,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNode } from '@colanode/server/data/schema';
import {
  fetchWorkspaceUser,
  markdownToBlocks,
  requireAccessibleNode,
  WikiToolContext,
  WikiToolError,
} from '@colanode/server/lib/ai/tools';
import { config } from '@colanode/server/lib/config';
import { EnabledProjectsConfig } from '@colanode/server/lib/config/projects';
import { createDocument, updateDocument } from '@colanode/server/lib/documents';
import {
  createNode,
  fetchNode,
  mapNode,
  updateNode,
} from '@colanode/server/lib/nodes';
import {
  buildProjectPageMarkdown,
  buildProjectRootMarkdown,
  buildRegisterMarkdown,
  ProjectContentContext,
  ProjectEmbed,
  projectRegisterFor,
} from '@colanode/server/lib/projects/content';
import {
  createOrLinkPlaneProject,
  listPlaneProjectLinks,
  PlaneProjectLink,
} from '@colanode/server/lib/projects/plane-link';

export class ProjectError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 502,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export type PlaneMode = 'create' | 'link' | 'none';

const OPTION_COLORS = [
  'blue',
  'green',
  'orange',
  'purple',
  'pink',
  'yellow',
  'red',
  'gray',
];

const PROJECT_FIELD_NAME = 'project';
const PROJECTS_CODE_FIELD = 'project code';

const today = (): string => new Date().toISOString().slice(0, 10);

export const getProjectsConfig = (): EnabledProjectsConfig => {
  const projects = config.projects;
  if (!projects.enabled) {
    throw new ProjectError(
      400,
      'projects_disabled',
      'The project template is not enabled on this server.'
    );
  }
  return projects;
};

const planeSettings = () => {
  const plane = config.plane;
  const projects = config.projects;
  if (!plane.enabled || !projects.enabled || !projects.linkSecret) {
    return null;
  }
  return { plane, secret: projects.linkSecret };
};

const assertCode = (code: string): void => {
  if (!isValidProjectCode(code)) {
    throw new ProjectError(
      400,
      'invalid_code',
      'A project code is 2 to 10 capital letters, the same as its Plane identifier.'
    );
  }
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const isLive = sql<boolean>`(attributes->>'deletedAt') is null`;

export type WikiProject = {
  pageId: string;
  parentId: string | null;
  name: string;
  code: string;
};

export const listWikiProjects = async (
  workspaceId: string
): Promise<WikiProject[]> => {
  const rows = await database
    .selectFrom('nodes')
    .select(['id', 'parent_id', 'attributes'])
    .where('workspace_id', '=', workspaceId)
    .where('type', '=', 'page')
    .where(sql<boolean>`(attributes->>'projectCode') is not null`)
    .where(isLive)
    .execute();

  return rows.map((row) => {
    const attributes = row.attributes as PageAttributes;
    return {
      pageId: row.id,
      parentId: row.parent_id,
      name: attributes.name,
      code: attributes.projectCode ?? '',
    };
  });
};

const liveChildPages = async (parentId: string): Promise<SelectNode[]> =>
  await database
    .selectFrom('nodes')
    .selectAll()
    .where('parent_id', '=', parentId)
    .where('type', '=', 'page')
    .where(isLive)
    .execute();

const liveChildren = async (parentId: string): Promise<SelectNode[]> =>
  await database
    .selectFrom('nodes')
    .selectAll()
    .where('parent_id', '=', parentId)
    .where(isLive)
    .execute();

// The order the sidebar shows siblings in (see orderSiblings in
// packages/ui/src/lib/sibling-order.ts): by id, each getting a default key
// from that position, overridden by its own index once it has been dragged.
const siblingKeys = (siblings: SelectNode[]): Map<string, string> => {
  const keys = new Map<string, string>();
  let lastDefault: string | null = null;
  for (const sibling of [...siblings].sort((a, b) =>
    compareString(a.id, b.id)
  )) {
    lastDefault = generateFractionalIndex(lastDefault, null);
    const custom = (sibling.attributes as { index?: string | null }).index;
    keys.set(sibling.id, custom ?? lastDefault);
  }
  return keys;
};

export type ProjectParent = {
  id: string;
  spaceId: string;
  name: string;
  depth: number;
  path: string;
};

// Where a new project can go: the missions of the projects space and the
// product lines under them. A page that is itself a project, or a page of
// one, is not offered.
export const listProjectParents = async (): Promise<ProjectParent[]> => {
  const cfg = getProjectsConfig();
  const parents: ProjectParent[] = [];

  const missions = (await liveChildren(cfg.spaceId))
    .filter((node) => node.type === 'page' || node.type === 'folder')
    .filter((node) => !isProjectNode(node));

  for (const mission of missions) {
    const missionName = nodeName(mission);
    parents.push({
      id: mission.id,
      spaceId: cfg.spaceId,
      name: missionName,
      depth: 1,
      path: missionName,
    });

    const lines = (await liveChildren(mission.id))
      .filter((node) => node.type === 'page' || node.type === 'folder')
      .filter((node) => !isProjectNode(node));
    for (const line of lines) {
      // A product line is a page whose own children are projects or pages
      // with children; a plain page with no children is more likely a
      // project that has not been aligned yet, still a valid parent but
      // listed after the lines.
      const name = nodeName(line);
      parents.push({
        id: line.id,
        spaceId: cfg.spaceId,
        name,
        depth: 2,
        path: `${missionName} › ${name}`,
      });
    }
  }

  return parents;
};

const nodeName = (node: SelectNode): string =>
  (node.attributes as { name?: string }).name ?? 'Untitled';

const isProjectNode = (node: SelectNode): boolean => {
  const attributes = node.attributes as Partial<PageAttributes>;
  return Boolean(attributes.projectCode) || Boolean(attributes.projectRole);
};

// ---------------------------------------------------------------------------
// Select options: one per project, named with its code
// ---------------------------------------------------------------------------

type OptionPlan =
  | { action: 'exists'; optionId: string }
  | { action: 'rename'; optionId: string; from: string }
  | { action: 'add' };

const findSelectField = (
  attributes: DatabaseAttributes,
  name: string
): Extract<FieldAttributes, { type: 'select' }> | null => {
  for (const field of Object.values(attributes.fields ?? {})) {
    if (field.type === 'select' && field.name.trim().toLowerCase() === name) {
      return field;
    }
  }
  return null;
};

// What to do with a database's option for a project: reuse the option that
// already carries the code; else rename the option that names the project
// the old way (its page title, its Plane name, or the code with a hyphen as
// the Projects list wrote it, "STU-T"); else add one.
const planOption = (
  field: Extract<FieldAttributes, { type: 'select' }>,
  code: string,
  legacyNames: string[]
): OptionPlan => {
  const options = Object.values(field.options ?? {});
  const exact = options.find((option) => option.name === code);
  if (exact) {
    return { action: 'exists', optionId: exact.id };
  }

  const legacy = new Set(
    legacyNames.map(normalizeProjectPageName).filter((name) => name.length > 0)
  );
  const old = options.find(
    (option) =>
      normalizeProjectCode(option.name) === code ||
      legacy.has(normalizeProjectPageName(option.name))
  );
  if (old) {
    return { action: 'rename', optionId: old.id, from: old.name };
  }

  return { action: 'add' };
};

type OptionTarget = {
  key: 'requirements' | 'verification' | 'adr' | 'tasks' | 'projects';
  databaseId: string;
  fieldName: string;
};

const optionTargets = (cfg: EnabledProjectsConfig): OptionTarget[] => {
  const targets: OptionTarget[] = [
    {
      key: 'requirements',
      databaseId: cfg.databases.requirements,
      fieldName: PROJECT_FIELD_NAME,
    },
    {
      key: 'verification',
      databaseId: cfg.databases.verification,
      fieldName: PROJECT_FIELD_NAME,
    },
    {
      key: 'adr',
      databaseId: cfg.databases.adr,
      fieldName: PROJECT_FIELD_NAME,
    },
  ];
  if (cfg.databases.tasks) {
    targets.push({
      key: 'tasks',
      databaseId: cfg.databases.tasks,
      fieldName: PROJECT_FIELD_NAME,
    });
  }
  if (cfg.databases.projects) {
    targets.push({
      key: 'projects',
      databaseId: cfg.databases.projects,
      fieldName: PROJECTS_CODE_FIELD,
    });
  }
  return targets;
};

export type OptionReport = {
  database: string;
  databaseName: string;
  action: 'exists' | 'rename' | 'add' | 'missing_field';
  from?: string;
};

const describeOptions = async (
  cfg: EnabledProjectsConfig,
  code: string,
  legacyNames: string[]
): Promise<OptionReport[]> => {
  const reports: OptionReport[] = [];
  for (const target of optionTargets(cfg)) {
    const node = await fetchNode(target.databaseId);
    if (!node || node.type !== 'database') {
      reports.push({
        database: target.key,
        databaseName: target.databaseId,
        action: 'missing_field',
      });
      continue;
    }
    const attributes = node.attributes as DatabaseAttributes;
    const field = findSelectField(attributes, target.fieldName);
    if (!field) {
      reports.push({
        database: target.key,
        databaseName: attributes.name,
        action: 'missing_field',
      });
      continue;
    }
    const plan = planOption(field, code, legacyNames);
    reports.push({
      database: target.key,
      databaseName: attributes.name,
      action: plan.action,
      from: plan.action === 'rename' ? plan.from : undefined,
    });
  }
  return reports;
};

// Applies the option plan inside the update itself, so two projects created
// at the same moment cannot overwrite each other's option.
const ensureOption = async (
  ctx: WikiToolContext,
  target: OptionTarget,
  code: string,
  legacyNames: string[]
): Promise<ProjectEmbed | null> => {
  const node = await fetchNode(target.databaseId);
  if (!node || node.type !== 'database') {
    return null;
  }
  const initial = findSelectField(
    node.attributes as DatabaseAttributes,
    target.fieldName
  );
  if (!initial) {
    return null;
  }

  let optionId: string | null = null;
  const updated = await updateNode({
    nodeId: target.databaseId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      if (attributes.type !== 'database') {
        return null;
      }
      const field = findSelectField(attributes, target.fieldName);
      if (!field) {
        return null;
      }
      const plan = planOption(field, code, legacyNames);
      if (plan.action === 'exists') {
        optionId = plan.optionId;
        return null;
      }

      const options = { ...(field.options ?? {}) };
      if (plan.action === 'rename') {
        optionId = plan.optionId;
        options[plan.optionId] = { ...options[plan.optionId]!, name: code };
      } else {
        const id = optionId ?? generateId(IdType.SelectOption);
        optionId = id;
        const maxIndex = Object.values(options)
          .map((option) => option.index)
          .sort(compareString)
          .at(-1);
        options[id] = {
          id,
          name: code,
          color:
            OPTION_COLORS[Object.keys(options).length % OPTION_COLORS.length]!,
          index: generateFractionalIndex(maxIndex ?? null, null),
        };
      }

      return {
        ...attributes,
        fields: {
          ...attributes.fields,
          [field.id]: { ...field, options },
        },
      };
    },
  });

  // updateNode reports false when the updater changed nothing, which is the
  // normal outcome for an option that already carried the code.
  if (!optionId) {
    return null;
  }
  if (!updated) {
    const check = await fetchNode(target.databaseId);
    const field = check
      ? findSelectField(
          check.attributes as DatabaseAttributes,
          target.fieldName
        )
      : null;
    if (!field?.options?.[optionId]) {
      return null;
    }
  }

  return { databaseId: target.databaseId, fieldId: initial.id, optionId };
};

const ensureOptions = async (
  ctx: WikiToolContext,
  cfg: EnabledProjectsConfig,
  code: string,
  legacyNames: string[]
): Promise<Record<OptionTarget['key'], ProjectEmbed | null>> => {
  const embeds: Record<OptionTarget['key'], ProjectEmbed | null> = {
    requirements: null,
    verification: null,
    adr: null,
    tasks: null,
    projects: null,
  };
  for (const target of optionTargets(cfg)) {
    embeds[target.key] = await ensureOption(ctx, target, code, legacyNames);
  }
  return embeds;
};

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

const userContext = async (ctx: WikiToolContext) => {
  const user = await fetchWorkspaceUser(ctx);
  return {
    id: user.id,
    role: user.role,
    workspaceId: user.workspaceId,
    accountId: user.accountId,
  };
};

const assertCanCreatePageUnder = async (
  ctx: WikiToolContext,
  parentId: string,
  name: string
): Promise<SelectNode[]> => {
  const { tree } = await requireAccessibleNode(parentId, ctx);
  const attributes: PageAttributes = { type: 'page', name, parentId };
  const canCreate: CanCreateNodeContext = {
    user: await userContext(ctx),
    tree: tree.map(mapNode),
    attributes,
  };
  if (!getNodeModel('page').canCreate(canCreate)) {
    throw new ProjectError(
      403,
      'forbidden',
      'You do not have permission to create pages here.'
    );
  }
  return tree;
};

const assertCanEditPage = async (
  ctx: WikiToolContext,
  pageId: string
): Promise<SelectNode> => {
  const { node, role } = await requireAccessibleNode(pageId, ctx);
  if (node.type !== 'page') {
    throw new ProjectError(400, 'not_a_page', 'A project is a page.');
  }
  if (!hasNodeRole(role, 'editor')) {
    throw new ProjectError(
      403,
      'forbidden',
      'You need edit rights on this page to make it a project.'
    );
  }
  return node;
};

// ---------------------------------------------------------------------------
// Writing pages
// ---------------------------------------------------------------------------

const writePage = async (
  ctx: WikiToolContext,
  input: {
    id: string;
    rootId: string;
    parentId: string;
    name: string;
    index: string | null;
    projectCode?: string;
    projectRole?: ProjectRole;
    markdown: string;
  }
): Promise<void> => {
  const attributes: PageAttributes = {
    type: 'page',
    name: input.name,
    parentId: input.parentId,
    ...(input.index ? { index: input.index } : {}),
    ...(input.projectCode ? { projectCode: input.projectCode } : {}),
    ...(input.projectRole ? { projectRole: input.projectRole } : {}),
  };

  const created = await createNode({
    nodeId: input.id,
    rootId: input.rootId,
    attributes,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  if (!created) {
    throw new ProjectError(
      502,
      'create_failed',
      `The page "${input.name}" could not be created.`
    );
  }

  const blocks = markdownToBlocks(input.id, input.markdown);
  const document = await createDocument({
    nodeId: input.id,
    content: { type: 'rich_text', blocks },
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  if (!document) {
    throw new ProjectError(
      502,
      'content_failed',
      `The page "${input.name}" was created but its content could not be saved.`
    );
  }
};

const setPageAttributes = async (
  ctx: WikiToolContext,
  pageId: string,
  patch: { projectCode?: string; projectRole?: ProjectRole | null }
): Promise<void> => {
  await updateNode({
    nodeId: pageId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      if (attributes.type !== 'page') {
        return null;
      }
      if (
        (patch.projectCode === undefined ||
          attributes.projectCode === patch.projectCode) &&
        (patch.projectRole === undefined ||
          (attributes.projectRole ?? null) === patch.projectRole)
      ) {
        return null;
      }
      return { ...attributes, ...patch };
    },
  });
};

const documentBlocks = async (
  pageId: string
): Promise<Record<string, Block> | null> => {
  const row = await database
    .selectFrom('documents')
    .select(['content'])
    .where('id', '=', pageId)
    .executeTakeFirst();
  if (!row) {
    return null;
  }
  const content = row.content as DocumentContent;
  return content.type === 'rich_text'
    ? ((content as RichTextContent).blocks ?? {})
    : null;
};

const hasEmbed = (
  blocks: Record<string, Block> | null,
  databaseId: string
): boolean =>
  blocks !== null &&
  Object.values(blocks).some(
    (block) => block.type === 'database' && block.id === databaseId
  );

// Puts the register at the top of a page that already has content: the new
// blocks get indexes before the page's first block, nothing else changes.
const prependMarkdown = async (
  ctx: WikiToolContext,
  pageId: string,
  markdown: string
): Promise<void> => {
  const existing = await documentBlocks(pageId);
  if (existing === null) {
    const document = await createDocument({
      nodeId: pageId,
      content: {
        type: 'rich_text',
        blocks: markdownToBlocks(pageId, markdown),
      },
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
    });
    if (!document) {
      throw new ProjectError(
        502,
        'content_failed',
        'A register could not be added.'
      );
    }
    return;
  }

  const ok = await updateDocument({
    documentId: pageId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (content) => {
      if (content.type !== 'rich_text') {
        return null;
      }
      const current = (content as RichTextContent).blocks ?? {};
      const first =
        Object.values(current)
          .filter((block) => block.parentId === pageId)
          .map((block) => block.index)
          .sort(compareString)[0] ?? null;

      const added = markdownToBlocks(pageId, markdown);
      const top = Object.values(added)
        .filter((block) => block.parentId === pageId)
        .sort((a, b) => compareString(a.index, b.index));
      let previous: string | null = null;
      for (const block of top) {
        previous = generateFractionalIndex(previous, first);
        block.index = previous;
      }

      return {
        ...content,
        blocks: { ...current, ...added },
      } as DocumentContent;
    },
  });
  if (!ok) {
    throw new ProjectError(
      502,
      'content_failed',
      'A register could not be added.'
    );
  }
};

// ---------------------------------------------------------------------------
// The Projects list record
// ---------------------------------------------------------------------------

// The Projects list predates the template and has no link fields: they are
// added the first time a project is written to it, then reused.
const ensureUrlFields = async (
  ctx: WikiToolContext,
  databaseId: string,
  names: string[]
): Promise<SelectNode | null> => {
  const node = await fetchNode(databaseId);
  if (!node || node.type !== 'database') {
    return null;
  }
  const has = (attributes: DatabaseAttributes, name: string) =>
    Object.values(attributes.fields ?? {}).some(
      (field) => field.name.trim().toLowerCase() === name.toLowerCase()
    );
  if (names.every((name) => has(node.attributes as DatabaseAttributes, name))) {
    return node;
  }

  await updateNode({
    nodeId: databaseId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      if (attributes.type !== 'database') {
        return null;
      }
      const missing = names.filter((name) => !has(attributes, name));
      if (missing.length === 0) {
        return null;
      }
      const fields = { ...attributes.fields };
      let last =
        Object.values(fields)
          .map((field) => field.index)
          .sort(compareString)
          .at(-1) ?? null;
      for (const name of missing) {
        const id = generateId(IdType.Field);
        last = generateFractionalIndex(last, null);
        fields[id] = { id, type: 'url', name, index: last };
      }
      return { ...attributes, fields };
    },
  });

  return await fetchNode(databaseId);
};

const upsertProjectsRecord = async (
  ctx: WikiToolContext,
  cfg: EnabledProjectsConfig,
  input: {
    code: string;
    name: string;
    codeOptionId: string | null;
    wikiUrl: string;
    planeUrl: string | null;
  }
): Promise<void> => {
  const databaseId = cfg.databases.projects;
  if (!databaseId || !input.codeOptionId) {
    return;
  }
  const db = await ensureUrlFields(ctx, databaseId, ['Wiki page', 'Plane']);
  if (!db || db.type !== 'database') {
    return;
  }
  const attributes = db.attributes as DatabaseAttributes;
  const fields = Object.values(attributes.fields ?? {});
  const byName = (name: string) =>
    fields.find((field) => field.name.trim().toLowerCase() === name);
  const codeField = byName(PROJECTS_CODE_FIELD);
  if (!codeField) {
    return;
  }

  const values: Record<string, FieldValue> = {
    [codeField.id]: { type: 'string', value: input.codeOptionId },
  };
  const wikiField = byName('wiki page');
  if (wikiField?.type === 'url') {
    values[wikiField.id] = { type: 'string', value: input.wikiUrl };
  }
  const planeField = byName('plane');
  if (planeField?.type === 'url' && input.planeUrl) {
    values[planeField.id] = { type: 'string', value: input.planeUrl };
  }

  const records = await database
    .selectFrom('nodes')
    .selectAll()
    .where('parent_id', '=', databaseId)
    .where('type', '=', 'record')
    .where(isLive)
    .execute();

  const wanted = normalizeProjectPageName(input.name);
  const existing =
    records.find((record) => {
      const value = (record.attributes as RecordAttributes).fields?.[
        codeField.id
      ];
      return value?.type === 'string' && value.value === input.codeOptionId;
    }) ??
    records.find(
      (record) =>
        normalizeProjectPageName(
          (record.attributes as RecordAttributes).name
        ) === wanted
    );

  if (existing) {
    await updateNode({
      nodeId: existing.id,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      updater: (current) => {
        if (current.type !== 'record') {
          return null;
        }
        return { ...current, fields: { ...current.fields, ...values } };
      },
    });
    return;
  }

  const record: RecordAttributes = {
    type: 'record',
    parentId: databaseId,
    databaseId,
    name: input.name,
    fields: values,
  };
  await createNode({
    nodeId: generateId(IdType.Record),
    rootId: db.root_id,
    attributes: record,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
};

const wikiUrl = (workspaceId: string, nodeId: string): string =>
  `https://docs.arribada.org/${workspaceId}/${nodeId}`;

// ---------------------------------------------------------------------------
// Plane
// ---------------------------------------------------------------------------

export type PlaneStatus =
  | { state: 'disabled' }
  | { state: 'unreachable' }
  | { state: 'absent' }
  | { state: 'free'; project: PlaneProjectLink }
  | { state: 'linked'; project: PlaneProjectLink }
  | { state: 'linked_elsewhere'; project: PlaneProjectLink };

const planeStatusFor = async (
  code: string,
  wikiNodeIds: string[]
): Promise<PlaneStatus> => {
  const settings = planeSettings();
  if (!settings) {
    return { state: 'disabled' };
  }
  const result = await listPlaneProjectLinks(settings.plane, settings.secret);
  if (!result.ok) {
    return { state: 'unreachable' };
  }
  const project = result.value.find((p) => p.identifier === code);
  if (!project) {
    return { state: 'absent' };
  }
  if (!project.wikiNodeId) {
    return { state: 'free', project };
  }
  return wikiNodeIds.includes(project.wikiNodeId)
    ? { state: 'linked', project }
    : { state: 'linked_elsewhere', project };
};

export const checkProjectCode = async (
  workspaceId: string,
  code: string
): Promise<{
  valid: boolean;
  wiki: WikiProject | null;
  plane: PlaneStatus;
}> => {
  if (!isValidProjectCode(code)) {
    return { valid: false, wiki: null, plane: { state: 'disabled' } };
  }
  const wiki =
    (await listWikiProjects(workspaceId)).find((p) => p.code === code) ?? null;
  const plane = await planeStatusFor(code, []);
  return { valid: true, wiki, plane };
};

const linkPlane = async (
  mode: 'create' | 'link',
  input: {
    code: string;
    name: string;
    overviewId: string;
    actorEmail: string | null;
  }
): Promise<PlaneProjectLink> => {
  const settings = planeSettings();
  if (!settings) {
    throw new ProjectError(
      400,
      'plane_disabled',
      'The link with Plane is not configured on this server.'
    );
  }
  const result = await createOrLinkPlaneProject(
    settings.plane,
    settings.secret,
    {
      mode,
      identifier: input.code,
      name: input.name,
      wikiNodeId: input.overviewId,
      wikiTitle: `${input.name} — Overview`,
      actorEmail: input.actorEmail,
    }
  );
  if (!result.ok) {
    if (result.status === 409) {
      throw new ProjectError(
        409,
        result.error,
        mode === 'create'
          ? `Plane already has a project with the identifier ${input.code}. Link to it instead.`
          : `The Plane project ${input.code} is already linked to another wiki page.`
      );
    }
    if (result.status === 404) {
      throw new ProjectError(
        404,
        'plane_project_not_found',
        `Plane has no project with the identifier ${input.code}.`
      );
    }
    throw new ProjectError(
      502,
      'plane_failed',
      `Plane refused the request (${result.error}).`
    );
  }
  return result.value;
};

const actorEmail = async (ctx: WikiToolContext): Promise<string | null> => {
  const row = await database
    .selectFrom('users')
    .select(['email'])
    .where('id', '=', ctx.userId)
    .where('workspace_id', '=', ctx.workspaceId)
    .executeTakeFirst();
  return row?.email ?? null;
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateProjectInput = {
  parentId: string;
  name: string;
  code: string;
  plane: PlaneMode;
  // Set when Plane itself asks: the project already exists there and must
  // not be created or linked again from here.
  planeProject?: PlaneProjectLink | null;
};

export type CreateProjectOutput = {
  rootId: string;
  overviewId: string;
  pageIds: Partial<Record<ProjectRole, string>>;
  plane: PlaneProjectLink | null;
};

export const createProject = async (
  ctx: WikiToolContext,
  input: CreateProjectInput
): Promise<CreateProjectOutput> => {
  const cfg = getProjectsConfig();
  const code = input.code.trim();
  const name = input.name.trim();
  assertCode(code);
  if (name.length === 0) {
    throw new ProjectError(400, 'invalid_name', 'A project needs a name.');
  }

  const taken = (await listWikiProjects(ctx.workspaceId)).find(
    (project) => project.code === code
  );
  if (taken) {
    throw new ProjectError(
      409,
      'code_taken',
      `The code ${code} is already used by the wiki project "${taken.name}".`
    );
  }

  const tree = await assertCanCreatePageUnder(ctx, input.parentId, name);
  const spaceId = tree[0]?.id;
  if (!spaceId) {
    throw new ProjectError(
      404,
      'parent_not_found',
      'The parent was not found.'
    );
  }

  const rootId = generateId(IdType.Page);
  const pageIds: Partial<Record<ProjectRole, string>> = {};
  for (const page of PROJECT_TEMPLATE_PAGES) {
    pageIds[page.role] = generateId(IdType.Page);
  }
  const overviewId = pageIds.overview!;

  // Plane first: if it refuses (identifier taken, not reachable), nothing has
  // been written on the wiki yet and the user can simply try again.
  let plane: PlaneProjectLink | null = input.planeProject ?? null;
  if (!plane && input.plane !== 'none') {
    plane = await linkPlane(input.plane, {
      code,
      name,
      overviewId,
      actorEmail: await actorEmail(ctx),
    });
  }

  const embeds = await ensureOptions(ctx, cfg, code, [name, plane?.name ?? '']);
  const content: ProjectContentContext = {
    code,
    name,
    pageIds,
    helpPageId: cfg.helpPageId ?? null,
    planeUrl: plane?.url ?? null,
    embeds: {
      requirements: embeds.requirements,
      verification: embeds.verification,
      adr: embeds.adr,
      tasks: embeds.tasks,
    },
    today: today(),
  };

  await writePage(ctx, {
    id: rootId,
    rootId: spaceId,
    parentId: input.parentId,
    name,
    index: null,
    projectCode: code,
    markdown: buildProjectRootMarkdown(content),
  });

  let previous: string | null = null;
  for (const page of PROJECT_TEMPLATE_PAGES) {
    previous = generateFractionalIndex(previous, null);
    await writePage(ctx, {
      id: pageIds[page.role]!,
      rootId: spaceId,
      parentId: rootId,
      name: page.name,
      index: previous,
      projectRole: page.role,
      markdown: buildProjectPageMarkdown(page.role, content),
    });
  }

  await upsertProjectsRecord(ctx, cfg, {
    code,
    name,
    codeOptionId: embeds.projects?.optionId ?? null,
    wikiUrl: wikiUrl(ctx.workspaceId, overviewId),
    planeUrl: plane?.url ?? null,
  });

  return { rootId, overviewId, pageIds, plane };
};

// ---------------------------------------------------------------------------
// Align
// ---------------------------------------------------------------------------

export type AlignPlan = {
  pageId: string;
  name: string;
  code: string;
  roles: Array<{
    pageId: string;
    name: string;
    role: ProjectRole;
    via: 'name' | 'alias' | 'kept' | 'set';
  }>;
  create: Array<{ role: ProjectRole; name: string }>;
  registers: Array<{ pageId: string; role: ProjectRole; name: string }>;
  unmatched: Array<{ pageId: string; name: string }>;
  // Pages that carry a role today and lose it to an explicit choice.
  clear: Array<{ pageId: string; name: string }>;
  options: OptionReport[];
  plane: PlaneStatus;
};

const planAlignment = async (
  ctx: WikiToolContext,
  cfg: EnabledProjectsConfig,
  page: SelectNode,
  code: string,
  aliases: string[],
  choices: AlignChoices
): Promise<{ plan: AlignPlan; children: SelectNode[] }> => {
  const attributes = page.attributes as PageAttributes;
  const children = await liveChildPages(page.id);
  const childIds = new Set(children.map((child) => child.id));

  // Roles given explicitly win over everything: "Calibration, tests and
  // validation" IS this project's tests page, whatever its title says. A
  // null takes a page out of the template on purpose.
  const set = Object.entries(choices.roles)
    .filter(([pageId]) => childIds.has(pageId))
    .map(([pageId, role]) => ({ pageId, role }));
  const setIds = new Set(set.map((entry) => entry.pageId));
  const assigned = set.filter(
    (entry): entry is { pageId: string; role: ProjectRole } =>
      isProjectRole(entry.role)
  );
  const assignedRoles = new Set(assigned.map((entry) => entry.role));

  // A role set by hand (or by an earlier alignment) is kept as it is, unless
  // an explicit choice gives that role to another page.
  const withRole = children
    .map((child) => ({
      child,
      role: (child.attributes as PageAttributes).projectRole,
    }))
    .filter((entry): entry is { child: SelectNode; role: ProjectRole } =>
      isProjectRole(entry.role)
    );
  const kept = withRole.filter(
    (entry) => !setIds.has(entry.child.id) && !assignedRoles.has(entry.role)
  );
  const clear = withRole
    .filter(
      (entry) =>
        !kept.includes(entry) &&
        !assigned.some(
          (choice) =>
            choice.pageId === entry.child.id && choice.role === entry.role
        )
    )
    .map((entry) => ({ pageId: entry.child.id, name: nodeName(entry.child) }));
  const keptRoles = new Set([
    ...kept.map((entry) => entry.role),
    ...assignedRoles,
  ]);
  const keptIds = new Set([...kept.map((entry) => entry.child.id), ...setIds]);
  const roleOwners = new Set(withRole.map((entry) => entry.child.id));

  const matched = matchProjectRoles(
    children
      .filter((child) => !keptIds.has(child.id) && !roleOwners.has(child.id))
      .sort((a, b) => compareString(a.id, b.id))
      .map((child) => ({ id: child.id, name: nodeName(child) }))
  ).filter((match) => !keptRoles.has(match.role));

  const byId = new Map(children.map((child) => [child.id, child]));
  const roles: AlignPlan['roles'] = [
    ...assigned.map((entry) => ({
      pageId: entry.pageId,
      name: nodeName(byId.get(entry.pageId)!),
      role: entry.role,
      via: 'set' as const,
    })),
    ...kept.map((entry) => ({
      pageId: entry.child.id,
      name: nodeName(entry.child),
      role: entry.role,
      via: 'kept' as const,
    })),
    ...matched.map((match) => ({
      pageId: match.pageId,
      name: nodeName(byId.get(match.pageId)!),
      role: match.role,
      via: match.via,
    })),
  ];

  // A project does not need every page (Conventions and templates): which
  // missing pages to add is a choice, all of them by default.
  const present = new Set(roles.map((entry) => entry.role));
  const wanted = (role: ProjectRole) =>
    choices.createMissing === true ||
    (Array.isArray(choices.createMissing) &&
      choices.createMissing.includes(role));
  const create = PROJECT_TEMPLATE_PAGES.filter(
    (template) => !present.has(template.role) && wanted(template.role)
  ).map((template) => ({ role: template.role, name: template.name }));

  const registers: AlignPlan['registers'] = [];
  const registerDb: Partial<Record<ProjectRole, string>> = {
    requirements: cfg.databases.requirements,
    tests: cfg.databases.verification,
    decisions: cfg.databases.adr,
  };
  for (const entry of roles) {
    const databaseId = registerDb[entry.role];
    if (!databaseId) {
      continue;
    }
    if (!hasEmbed(await documentBlocks(entry.pageId), databaseId)) {
      registers.push({
        pageId: entry.pageId,
        role: entry.role,
        name: entry.name,
      });
    }
  }

  const roleIds = new Set(roles.map((entry) => entry.pageId));
  const unmatched = children
    .filter((child) => !roleIds.has(child.id))
    .map((child) => ({ pageId: child.id, name: nodeName(child) }));

  const overview = roles.find((entry) => entry.role === 'overview');
  const plane = await planeStatusFor(
    code,
    [page.id, overview?.pageId].filter((id): id is string => Boolean(id))
  );

  const legacy = [attributes.name, planeName(plane), ...aliases];
  const options = await describeOptions(cfg, code, legacy);

  return {
    plan: {
      pageId: page.id,
      name: attributes.name,
      code,
      roles,
      create,
      registers,
      unmatched,
      clear,
      options,
      plane,
    },
    children,
  };
};

export type AlignChoices = {
  roles: Record<string, string | null>;
  createMissing: boolean | ProjectRole[];
};

const planeName = (status: PlaneStatus): string =>
  'project' in status ? status.project.name : '';

export type AlignProjectInput = {
  pageId: string;
  code: string;
  apply: boolean;
  // What to do on Plane when the project has no linked Plane project yet.
  plane: PlaneMode;
  // Other names the project's select options may carry today ("Sea Turtle
  // Doppler"), besides its page title and its Plane name.
  aliases?: string[];
  // Explicit roles by page id (null = no role), over title matching.
  roles?: Record<string, string | null>;
  // Which missing template pages to add: all (default), none, or these roles.
  createMissing?: boolean | string[];
};

export type AlignProjectOutput = {
  plan: AlignPlan;
  applied: boolean;
  plane: PlaneProjectLink | null;
};

export const alignProject = async (
  ctx: WikiToolContext,
  input: AlignProjectInput
): Promise<AlignProjectOutput> => {
  const cfg = getProjectsConfig();
  const code = input.code.trim();
  assertCode(code);

  const page = await assertCanEditPage(ctx, input.pageId);
  const attributes = page.attributes as PageAttributes;
  if (attributes.projectCode && attributes.projectCode !== code) {
    throw new ProjectError(
      409,
      'already_project',
      `This page is already the project ${attributes.projectCode}.`
    );
  }
  if (attributes.projectRole) {
    throw new ProjectError(
      400,
      'project_page',
      'This page is one of the pages of a project, not a project itself.'
    );
  }
  const other = (await listWikiProjects(ctx.workspaceId)).find(
    (project) => project.code === code && project.pageId !== page.id
  );
  if (other) {
    throw new ProjectError(
      409,
      'code_taken',
      `The code ${code} is already used by the wiki project "${other.name}".`
    );
  }

  const aliases = (input.aliases ?? []).filter((alias) => alias.trim());
  const choices: AlignChoices = {
    roles: input.roles ?? {},
    createMissing: Array.isArray(input.createMissing)
      ? input.createMissing.filter(isProjectRole)
      : (input.createMissing ?? true),
  };
  const { plan, children } = await planAlignment(
    ctx,
    cfg,
    page,
    code,
    aliases,
    choices
  );
  if (!input.apply) {
    return { plan, applied: false, plane: null };
  }

  // A Plane project linked to another wiki page is not fatal: the wiki side
  // is aligned, the link is left to a person to sort out, and the plan says
  // so.

  // Ids of the pages to create, so the content of every page can mention
  // the others.
  const pageIds: Partial<Record<ProjectRole, string>> = {};
  for (const entry of plan.roles) {
    pageIds[entry.role] = entry.pageId;
  }
  for (const entry of plan.create) {
    pageIds[entry.role] = generateId(IdType.Page);
  }

  let plane: PlaneProjectLink | null =
    plan.plane.state === 'linked' ? plan.plane.project : null;
  if (plan.plane.state === 'free' && input.plane !== 'none') {
    plane = await linkPlane('link', {
      code,
      name: attributes.name,
      overviewId: pageIds.overview!,
      actorEmail: await actorEmail(ctx),
    });
  } else if (plan.plane.state === 'absent' && input.plane === 'create') {
    plane = await linkPlane('create', {
      code,
      name: attributes.name,
      overviewId: pageIds.overview!,
      actorEmail: await actorEmail(ctx),
    });
  }

  const embeds = await ensureOptions(ctx, cfg, code, [
    attributes.name,
    planeName(plan.plane),
    ...aliases,
  ]);
  const content: ProjectContentContext = {
    code,
    name: attributes.name,
    pageIds,
    helpPageId: cfg.helpPageId ?? null,
    planeUrl: plane?.url ?? null,
    embeds: {
      requirements: embeds.requirements,
      verification: embeds.verification,
      adr: embeds.adr,
      tasks: embeds.tasks,
    },
    today: today(),
  };

  await setPageAttributes(ctx, page.id, { projectCode: code });
  for (const entry of plan.clear) {
    await setPageAttributes(ctx, entry.pageId, { projectRole: null });
  }
  for (const entry of plan.roles) {
    await setPageAttributes(ctx, entry.pageId, { projectRole: entry.role });
  }

  // A missing page goes right after the page of the role before it, so the
  // sidebar reads in the template's order wherever it can.
  const keys = siblingKeys(children);
  const placed = new Map<ProjectRole, string>();
  for (const entry of plan.roles) {
    const key = keys.get(entry.pageId);
    if (key) {
      placed.set(entry.role, key);
    }
  }
  const allKeys = [...keys.values()].sort(compareString);
  for (const template of PROJECT_TEMPLATE_PAGES) {
    if (!plan.create.some((entry) => entry.role === template.role)) {
      continue;
    }
    const order = PROJECT_TEMPLATE_PAGES.findIndex(
      (p) => p.role === template.role
    );
    const before = PROJECT_TEMPLATE_PAGES.slice(0, order)
      .map((p) => placed.get(p.role))
      .filter((key): key is string => Boolean(key))
      .sort(compareString)
      .at(-1);
    const lower = before ?? null;
    const upper =
      allKeys.find((key) => lower === null || compareString(key, lower) > 0) ??
      null;
    let index: string;
    try {
      index = generateFractionalIndex(lower, upper);
    } catch {
      index = generateFractionalIndex(allKeys.at(-1) ?? null, null);
    }
    allKeys.push(index);
    allKeys.sort(compareString);
    placed.set(template.role, index);

    await writePage(ctx, {
      id: pageIds[template.role]!,
      rootId: page.root_id,
      parentId: page.id,
      name: template.name,
      index,
      projectRole: template.role,
      markdown: buildProjectPageMarkdown(template.role, content),
    });
  }

  for (const entry of plan.registers) {
    const register = projectRegisterFor(entry.role, content);
    if (register) {
      await prependMarkdown(
        ctx,
        entry.pageId,
        buildRegisterMarkdown(content, register, entry.role)
      );
    }
  }

  await upsertProjectsRecord(ctx, cfg, {
    code,
    name: attributes.name,
    codeOptionId: embeds.projects?.optionId ?? null,
    wikiUrl: wikiUrl(ctx.workspaceId, pageIds.overview!),
    planeUrl: plane?.url ?? null,
  });

  return { plan, applied: true, plane };
};

// A thrown WikiToolError (access checks borrowed from the AI tools) is a
// not-found or forbidden in disguise; routes map both kinds the same way.
export const toProjectError = (error: unknown): ProjectError | null => {
  if (error instanceof ProjectError) {
    return error;
  }
  if (error instanceof WikiToolError) {
    return new ProjectError(
      /permission/i.test(error.message) ? 403 : 404,
      'not_accessible',
      error.message
    );
  }
  return null;
};
