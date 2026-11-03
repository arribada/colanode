// The project graph, built where every record is: on the server. A device
// only holds what it has synced and opened, so a graph built from it showed
// MARLIN with no requirements at all. Uses the same pure builder as before
// (@colanode/core lib/project-graph), fed from Postgres.

import { sql } from 'kysely';

import {
  buildProjectGraph,
  DatabaseAttributes,
  extractBlocksMentions,
  PageAttributes,
  ProjectGraph,
  ProjectGraphDatabase,
  ProjectGraphInputNode,
  ProjectRegister,
  registersInDocument,
  RichTextContent,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNode } from '@colanode/server/data/schema';
import {
  requireAccessibleNode,
  WikiToolContext,
} from '@colanode/server/lib/ai/tools';
import { fetchNodeDescendants } from '@colanode/server/lib/nodes';

const EMPTY: ProjectGraph = {
  nodes: [],
  edges: [],
  unresolved: [],
  lanes: {},
  project: null,
};

const REGISTER_ROLES = ['requirements', 'tests', 'decisions'] as const;

const isLive = sql<boolean>`(attributes->>'deletedAt') is null`;

const toInput = (row: SelectNode): ProjectGraphInputNode => {
  const attributes = row.attributes as unknown as Record<string, unknown>;
  const text = (key: string) =>
    typeof attributes[key] === 'string' ? (attributes[key] as string) : null;
  return {
    id: row.id,
    type: row.type,
    name: text('name') ?? '',
    parentId: row.parent_id,
    projectCode: text('projectCode'),
    projectRole: text('projectRole'),
    databaseId: text('databaseId'),
    fields:
      row.type === 'record' && attributes.fields
        ? (attributes.fields as Record<string, unknown>)
        : undefined,
  };
};

export const buildProjectGraphForPage = async (
  ctx: WikiToolContext,
  pageId: string
): Promise<ProjectGraph> => {
  // Throws when the caller cannot see the page; the route maps that to 404.
  const { tree } = await requireAccessibleNode(pageId, ctx);
  const root = [...tree]
    .reverse()
    .find(
      (node) =>
        node.type === 'page' && (node.attributes as PageAttributes).projectCode
    );
  if (!root) {
    return EMPTY;
  }

  const descendantIds = (await fetchNodeDescendants(root.id)).filter(
    (id) => id !== root.id
  );
  const rows =
    descendantIds.length > 0
      ? await database
          .selectFrom('nodes')
          .selectAll()
          .where('id', 'in', descendantIds)
          .where(isLive)
          .execute()
      : [];

  const nodes: ProjectGraphInputNode[] = [toInput(root), ...rows.map(toInput)];

  // Where the registers are: declared on the root page by the server, or,
  // for a project assembled by hand, read from the embeds of its pages.
  const rootAttributes = root.attributes as PageAttributes;
  const registerPages = rows.filter(
    (row) =>
      row.parent_id === root.id &&
      row.type === 'page' &&
      (REGISTER_ROLES as readonly string[]).includes(
        (row.attributes as PageAttributes).projectRole ?? ''
      )
  );
  let registers: ProjectRegister[] = [];
  for (const page of registerPages) {
    const role = (page.attributes as PageAttributes)
      .projectRole as ProjectRegister['role'];
    const declared = rootAttributes.projectRegisters?.[role];
    if (declared) {
      registers.push({ pageId: page.id, role, ...declared });
    }
  }
  if (registers.length === 0 && registerPages.length > 0) {
    const documents = await database
      .selectFrom('documents')
      .select(['id', 'content'])
      .where(
        'id',
        'in',
        registerPages.map((page) => page.id)
      )
      .execute();
    for (const document of documents) {
      const page = registerPages.find((p) => p.id === document.id)!;
      registers.push(
        ...registersInDocument(
          document.id,
          (page.attributes as PageAttributes)
            .projectRole as ProjectRegister['role'],
          document.content
        )
      );
    }
  }

  // A register the caller cannot read is left out, records included.
  const databases: ProjectGraphDatabase[] = [];
  for (const databaseId of new Set(registers.map((r) => r.databaseId))) {
    try {
      const { node } = await requireAccessibleNode(databaseId, ctx);
      if (node.type === 'database') {
        databases.push({
          id: node.id,
          fields: (node.attributes as DatabaseAttributes)
            .fields as unknown as ProjectGraphDatabase['fields'],
        });
      }
    } catch {
      continue;
    }
  }
  const readable = new Set(databases.map((db) => db.id));
  registers = registers.filter((register) => readable.has(register.databaseId));

  const seen = new Set(nodes.map((node) => node.id));
  for (const register of registers) {
    const records = await database
      .selectFrom('nodes')
      .selectAll()
      .where('parent_id', '=', register.databaseId)
      .where('type', '=', 'record')
      .where(isLive)
      .where(
        sql<boolean>`attributes->'fields'->${register.fieldId}->>'value' = ${register.optionId}`
      )
      .execute();
    for (const record of records) {
      if (!seen.has(record.id)) {
        seen.add(record.id);
        nodes.push(toInput(record));
      }
    }
  }

  // Mentions, from the documents of everything in the project.
  const documents = await database
    .selectFrom('documents')
    .select(['id', 'content'])
    .where('id', 'in', [...seen])
    .execute();
  const references = documents.flatMap((document) =>
    extractBlocksMentions(
      document.id,
      (document.content as RichTextContent).blocks
    ).map((mention) => ({ nodeId: document.id, referenceId: mention.target }))
  );

  return buildProjectGraph({
    nodes,
    references,
    registers,
    databases,
    rootId: root.id,
  });
};
