// ABOUTME: Resolves the ancestor path (space down to parent) of many nodes in a
// ABOUTME: single query, so lists can tell apart pages that share a title.
import { Kysely, Transaction, sql } from 'kysely';

// A move gone wrong must never loop forever: no real wiki is this deep.
export const NODE_PATH_MAX_DEPTH = 32;

export type NodePathSegment = {
  id: string;
  type: string;
  name: string | null;
  avatar: string | null;
};

// Keyed by the requested node id; segments run from the space down to the
// immediate parent, the node itself excluded. A space has an empty path.
export type NodePaths = Record<string, NodePathSegment[]>;

export type NodePathRow = {
  start_id: string;
  depth: number;
  id: string;
  type: string;
  name: string | null;
  avatar: string | null;
};

/**
 * Turns the flat rows of the ancestor walk into one path per requested node.
 * Every requested id gets an entry, even one that is not stored locally, so a
 * caller never has to tell "no ancestors" from "not asked".
 */
export const buildNodePaths = (
  nodeIds: string[],
  rows: NodePathRow[]
): NodePaths => {
  const paths: NodePaths = {};
  for (const id of nodeIds) {
    paths[id] = [];
  }

  // The deepest ancestor is the space, so it comes first.
  const ancestors = rows
    .filter((row) => row.depth > 0)
    .sort((a, b) => b.depth - a.depth);

  for (const row of ancestors) {
    const path = paths[row.start_id];
    if (!path) {
      continue;
    }

    path.push({
      id: row.id,
      type: row.type,
      name: typeof row.name === 'string' ? row.name : null,
      avatar: typeof row.avatar === 'string' ? row.avatar : null,
    });
  }

  return paths;
};

export const sameNodePaths = (a: NodePaths, b: NodePaths): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export const fetchNodePaths = async <DB>(
  database: Kysely<DB> | Transaction<DB>,
  nodeIds: string[]
): Promise<NodePaths> => {
  const ids = [...new Set(nodeIds)];
  if (ids.length === 0) {
    return {};
  }

  const result = await sql<NodePathRow>`
    WITH RECURSIVE chain(start_id, id, parent_id, depth) AS (
      SELECT n.id, n.id, n.parent_id, 0
      FROM nodes n
      WHERE n.id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})
      UNION ALL
      SELECT chain.start_id, parent.id, parent.parent_id, chain.depth + 1
      FROM nodes parent
      JOIN chain ON parent.id = chain.parent_id
      WHERE chain.depth < ${NODE_PATH_MAX_DEPTH}
    )
    SELECT
      chain.start_id AS start_id,
      chain.depth AS depth,
      n.id AS id,
      n.type AS type,
      json_extract(n.attributes, '$.name') AS name,
      json_extract(n.attributes, '$.avatar') AS avatar
    FROM chain
    JOIN nodes n ON n.id = chain.id
    WHERE chain.depth > 0
  `.execute(database);

  return buildNodePaths(ids, result.rows);
};
