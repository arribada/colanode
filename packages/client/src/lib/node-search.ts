// ABOUTME: Workspace search over the local SQLite index: words, phrases and exclusions,
// ABOUTME: Notion's filters and orders, the total count, and each result's marked matches.
import { Kysely, RawBuilder, sql } from 'kysely';

import { WorkspaceDatabaseSchema } from '@colanode/client/databases/workspace';
import {
  buildFtsExclusionQuery,
  buildFtsUnitQueries,
} from '@colanode/client/lib/fts';
import {
  notInTrashedTreeSql,
  notTemplateSql,
} from '@colanode/client/lib/nodes';
import {
  NodeSearchFilters,
  NodeSearchOutput,
  NodeSearchResult,
  NodeSearchSort,
} from '@colanode/client/queries/nodes/node-search';
import {
  NodeSearchPassage,
  NodeSearchPreview,
} from '@colanode/client/queries/nodes/node-search-preview';
import {
  NodeAttributes,
  NodeType,
  ParsedSearchQuery,
  SearchTextRange,
  buildSearchExcerpt,
  buildTextOpening,
  countWords,
  findSearchMatches,
  findSubstringMatches,
  foldSearchText,
  hasSearchTerms,
  parseSearchQuery,
} from '@colanode/core';

type WorkspaceDb = Kysely<WorkspaceDatabaseSchema>;

// What a search lists unless told otherwise. Views, fields and the like are
// indexed too (they have names) but are never something to open from search.
export const SEARCHABLE_NODE_TYPES: NodeType[] = [
  'page',
  'database',
  'record',
  'folder',
  'file',
  'whiteboard',
  'space',
  'message',
];

const CHAT_NODE_TYPES: NodeType[] = ['channel', 'chat'];

export const NODE_SEARCH_DEFAULT_LIMIT = 30;
export const NODE_SEARCH_MAX_LIMIT = 200;
const PREVIEW_MAX_PASSAGES = 100;
// SQLite caps the parameters of one statement; ids go in by the few hundred.
const ID_CHUNK = 400;

interface Candidate {
  id: string;
  createdAt: string;
  editedAt: string;
  tier: number;
  rank: number;
}

interface CandidateRow {
  id: string;
  type: NodeType;
  name: string | null;
  created_at: string;
  edited_at: string;
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const hasActiveSearchFilters = (
  filters: NodeSearchFilters | undefined
): boolean =>
  !!filters &&
  ((filters.types?.length ?? 0) > 0 ||
    (filters.createdBy?.length ?? 0) > 0 ||
    !!filters.withinId ||
    !!filters.dateFrom ||
    !!filters.dateTo);

const matchFts = async (
  database: WorkspaceDb,
  table: 'node_texts' | 'document_texts',
  expression: string
): Promise<Map<string, number>> => {
  const result = await sql<{ id: string | null; rank: number }>`
    SELECT id, rank FROM ${sql.raw(table)}
    WHERE ${sql.raw(table)} MATCH ${expression}
  `.execute(database);

  const ranks = new Map<string, number>();
  for (const row of result.rows) {
    if (row.id && !ranks.has(row.id)) {
      ranks.set(row.id, row.rank);
    }
  }
  return ranks;
};

const intersect = (a: Set<string>, b: Iterable<string>): Set<string> => {
  const result = new Set<string>();
  for (const id of b) {
    if (a.has(id)) {
      result.add(id);
    }
  }
  return result;
};

const searchTypes = (filters: NodeSearchFilters): NodeType[] => {
  const chosen =
    filters.types && filters.types.length > 0
      ? filters.types
      : filters.includeChat
        ? [...SEARCHABLE_NODE_TYPES, ...CHAT_NODE_TYPES]
        : SEARCHABLE_NODE_TYPES;
  return filters.includeChat
    ? chosen
    : chosen.filter((type) => !CHAT_NODE_TYPES.includes(type));
};

const buildFilterSql = async (
  database: WorkspaceDb,
  filters: NodeSearchFilters
): Promise<RawBuilder<unknown>> => {
  const parts: RawBuilder<unknown>[] = [
    sql.raw(notInTrashedTreeSql('n')),
    sql.raw(notTemplateSql('n')),
  ];

  const types = searchTypes(filters);
  parts.push(
    types.length > 0 ? sql`n.type IN (${sql.join(types)})` : sql.raw('0')
  );

  if (!filters.includeChat) {
    parts.push(sql`NOT (n.type = 'message' AND EXISTS (
      SELECT 1 FROM nodes chat_root
      WHERE chat_root.id = n.root_id AND chat_root.type IN ('chat', 'channel')
    ))`);
  }

  if (filters.createdBy && filters.createdBy.length > 0) {
    parts.push(sql`n.created_by IN (${sql.join(filters.createdBy)})`);
  }

  if (filters.withinId) {
    const within = await database
      .selectFrom('nodes')
      .select(['type'])
      .where('id', '=', filters.withinId)
      .executeTakeFirst();
    // A space is a root: its whole tree shares its id as root_id, which is
    // indexed, where walking the children of a large space is not.
    parts.push(
      within?.type === 'space'
        ? sql`n.root_id = ${filters.withinId}`
        : sql`n.id IN (
            WITH RECURSIVE within_tree(id) AS (
              SELECT ${filters.withinId}
              UNION
              SELECT child.id FROM nodes child
              JOIN within_tree ON child.parent_id = within_tree.id
            ) SELECT id FROM within_tree
          )`
    );
  }

  const dateColumn =
    filters.dateField === 'created'
      ? sql`n.created_at`
      : sql`coalesce(n.updated_at, n.created_at)`;
  if (filters.dateFrom) {
    parts.push(sql`${dateColumn} >= ${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    parts.push(sql`${dateColumn} < ${filters.dateTo}`);
  }

  return sql.join(parts, sql` AND `);
};

const candidateSelect = sql`
  n.id AS id,
  n.type AS type,
  json_extract(n.attributes, '$.name') AS name,
  n.created_at AS created_at,
  coalesce(n.updated_at, n.created_at) AS edited_at
`;

const compareCandidates =
  (sort: NodeSearchSort) =>
  (a: Candidate, b: Candidate): number => {
    switch (sort) {
      case 'edited_desc':
        return b.editedAt.localeCompare(a.editedAt) || a.id.localeCompare(b.id);
      case 'edited_asc':
        return a.editedAt.localeCompare(b.editedAt) || a.id.localeCompare(b.id);
      case 'created_desc':
        return (
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
        );
      case 'created_asc':
        return (
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
        );
      default:
        // bm25 ranks are negative, the best the lowest; recency breaks ties,
        // the way Notion leans to what was edited lately.
        return (
          a.tier - b.tier ||
          a.rank - b.rank ||
          b.editedAt.localeCompare(a.editedAt) ||
          a.id.localeCompare(b.id)
        );
    }
  };

const wordsKey = (value: string): string =>
  (foldSearchText(value).match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');

const unitsOf = (parsed: ParsedSearchQuery): ParsedSearchQuery[] => [
  ...parsed.phrases.map((phrase) => ({
    terms: [],
    phrases: [phrase],
    excluded: [],
  })),
  ...parsed.terms.map((term) => ({
    terms: [term],
    phrases: [],
    excluded: [],
  })),
];

// The best-match tier of a node: its exact title, then a title holding every
// word, then its title and values together, then its body, then the nodes
// whose words are spread between title and body.
const relevanceTier = (
  name: string | null,
  parsed: ParsedSearchQuery,
  queryKey: string,
  inNodeText: boolean,
  inDocument: boolean
): number => {
  if (name && queryKey.length > 0 && wordsKey(name) === queryKey) {
    return 0;
  }
  if (
    name &&
    unitsOf(parsed).every((unit) => findSearchMatches(name, unit, 1).length > 0)
  ) {
    return 1;
  }
  if (inNodeText) {
    return 2;
  }
  return inDocument ? 3 : 4;
};

const findCandidates = async (
  database: WorkspaceDb,
  parsed: ParsedSearchQuery,
  filters: NodeSearchFilters,
  filterSql: RawBuilder<unknown>
): Promise<Candidate[]> => {
  const titleOnly = filters.titleOnly ?? false;
  const nameUnits = buildFtsUnitQueries(parsed, titleOnly ? 'name' : undefined);
  const bodyUnits = buildFtsUnitQueries(parsed);

  // Each word on its own, in the title and values or in the body: a node
  // must hold every word, but not all in the same place.
  let ids: Set<string> | null = null;
  for (let i = 0; i < nameUnits.length; i++) {
    const found = new Set(
      (await matchFts(database, 'node_texts', nameUnits[i]!)).keys()
    );
    if (!titleOnly) {
      for (const id of (
        await matchFts(database, 'document_texts', bodyUnits[i]!)
      ).keys()) {
        found.add(id);
      }
    }
    ids = ids === null ? found : intersect(ids, found);
    if (ids.size === 0) {
      return [];
    }
  }
  if (!ids) {
    return [];
  }

  const exclusion = buildFtsExclusionQuery(parsed);
  if (exclusion) {
    for (const id of (
      await matchFts(database, 'node_texts', exclusion)
    ).keys()) {
      ids.delete(id);
    }
    for (const id of (
      await matchFts(database, 'document_texts', exclusion)
    ).keys()) {
      ids.delete(id);
    }
  }

  // All the words at once, for the rank, and to know where they all are.
  const nodeTextRanks = await matchFts(
    database,
    'node_texts',
    titleOnly ? `name : (${bodyUnits.join(' ')})` : bodyUnits.join(' ')
  );
  const documentRanks = titleOnly
    ? new Map<string, number>()
    : await matchFts(database, 'document_texts', bodyUnits.join(' '));

  const queryKey = [
    ...parsed.phrases.map((phrase) => phrase.join(' ')),
    ...parsed.terms,
  ].join(' ');

  const candidates: Candidate[] = [];
  for (const group of chunk([...ids], ID_CHUNK)) {
    const result = await sql<CandidateRow>`
      SELECT ${candidateSelect}
      FROM nodes n
      WHERE n.id IN (${sql.join(group)}) AND ${filterSql}
    `.execute(database);

    for (const row of result.rows) {
      const nodeRank = nodeTextRanks.get(row.id);
      const documentRank = documentRanks.get(row.id);
      const tier = relevanceTier(
        row.name,
        parsed,
        queryKey,
        nodeRank !== undefined,
        documentRank !== undefined
      );
      candidates.push({
        id: row.id,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        tier,
        rank: (tier <= 2 ? nodeRank : documentRank) ?? 0,
      });
    }
  }

  return candidates;
};

const listByFilters = async (
  database: WorkspaceDb,
  sort: NodeSearchSort,
  filterSql: RawBuilder<unknown>,
  limit: number
): Promise<{ candidates: Candidate[]; total: number }> => {
  const orderBy =
    sort === 'edited_asc'
      ? sql`edited_at ASC`
      : sort === 'created_desc'
        ? sql`n.created_at DESC`
        : sort === 'created_asc'
          ? sql`n.created_at ASC`
          : sql`edited_at DESC`;

  const rows = await sql<CandidateRow>`
    SELECT ${candidateSelect}
    FROM nodes n
    WHERE ${filterSql}
    ORDER BY ${orderBy}, n.id
    LIMIT ${limit}
  `.execute(database);

  const count = await sql<{ total: number }>`
    SELECT count(*) AS total FROM nodes n WHERE ${filterSql}
  `.execute(database);

  return {
    candidates: rows.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      tier: 0,
      rank: 0,
    })),
    total: count.rows[0]?.total ?? 0,
  };
};

interface NodeTexts {
  values: Map<string, string | null>;
  bodies: Map<string, string | null>;
}

const fetchTexts = async (
  database: WorkspaceDb,
  ids: string[]
): Promise<NodeTexts> => {
  const values = new Map<string, string | null>();
  const bodies = new Map<string, string | null>();
  if (ids.length === 0) {
    return { values, bodies };
  }

  const nodeTexts = await database
    .selectFrom('node_texts')
    .select(['id', 'attributes'])
    .where('id', 'in', ids)
    .execute();
  for (const row of nodeTexts) {
    values.set(row.id, row.attributes);
  }

  const documentTexts = await database
    .selectFrom('document_texts')
    .select(['id', 'text'])
    .where('id', 'in', ids)
    .execute();
  for (const row of documentTexts) {
    bodies.set(row.id, row.text);
  }

  return { values, bodies };
};

const nameOf = (attributes: NodeAttributes): string | null =>
  'name' in attributes && typeof attributes.name === 'string'
    ? attributes.name
    : null;

const avatarOf = (attributes: NodeAttributes): string | null =>
  'avatar' in attributes && typeof attributes.avatar === 'string'
    ? attributes.avatar
    : null;

const buildResults = async (
  database: WorkspaceDb,
  candidates: Candidate[],
  parsed: ParsedSearchQuery
): Promise<NodeSearchResult[]> => {
  if (candidates.length === 0) {
    return [];
  }
  const ids = candidates.map((candidate) => candidate.id);

  const rows = await database
    .selectFrom('nodes')
    .selectAll()
    .where('id', 'in', ids)
    .execute();
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const roots = await database
    .selectFrom('nodes')
    .select(['id', 'type', 'attributes'])
    .where('id', 'in', [...new Set(rows.map((row) => row.root_id))])
    .execute();
  const rootById = new Map(
    roots.map((root) => [
      root.id,
      {
        type: root.type,
        name: nameOf(JSON.parse(root.attributes) as NodeAttributes),
      },
    ])
  );

  const searching = hasSearchTerms(parsed);
  const texts: NodeTexts = searching
    ? await fetchTexts(database, ids)
    : { values: new Map(), bodies: new Map() };

  const results: NodeSearchResult[] = [];
  for (const candidate of candidates) {
    const row = rowById.get(candidate.id);
    if (!row) {
      continue;
    }
    const attributes = JSON.parse(row.attributes) as NodeAttributes;
    const name = nameOf(attributes);

    const nameHighlights = searching ? findSearchMatches(name, parsed) : [];
    const valuesText = texts.values.get(row.id) ?? null;
    const body = texts.bodies.get(row.id) ?? null;
    const valueMatches = searching ? findSearchMatches(valuesText, parsed) : [];
    const bodyMatches = searching ? findSearchMatches(body, parsed) : [];

    const excerpt =
      body && bodyMatches.length > 0
        ? buildSearchExcerpt(body, bodyMatches, 0)
        : valuesText && valueMatches.length > 0
          ? buildSearchExcerpt(valuesText, valueMatches, 0)
          : null;

    const root = rootById.get(row.root_id);
    results.push({
      id: row.id,
      type: row.type,
      name,
      avatar: avatarOf(attributes),
      parentId: row.parent_id,
      rootId: row.root_id,
      rootType: root?.type ?? row.type,
      spaceName: root?.name ?? null,
      snippet: excerpt?.text ?? null,
      snippetHighlights: excerpt?.highlights ?? [],
      nameHighlights,
      matchCount:
        nameHighlights.length + valueMatches.length + bodyMatches.length,
      matchedIn:
        nameHighlights.length > 0 || valueMatches.length > 0
          ? 'name'
          : 'content',
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  }
  return results;
};

export interface NodeSearchOptions {
  searchQuery: string;
  limit?: number;
  sort?: NodeSearchSort;
  filters?: NodeSearchFilters;
}

export const searchNodes = async (
  database: WorkspaceDb,
  options: NodeSearchOptions
): Promise<NodeSearchOutput> => {
  const parsed = parseSearchQuery(options.searchQuery);
  const filters = options.filters ?? {};
  const sort = options.sort ?? 'relevance';
  const limit = Math.min(
    Math.max(options.limit ?? NODE_SEARCH_DEFAULT_LIMIT, 1),
    NODE_SEARCH_MAX_LIMIT
  );

  const searching = hasSearchTerms(parsed);
  // An empty box with a filter lists what the filter keeps, like Notion's
  // "created by me, last 7 days" with nothing typed.
  if (!searching && !hasActiveSearchFilters(filters)) {
    return { results: [], total: 0 };
  }

  const filterSql = await buildFilterSql(database, filters);

  if (!searching) {
    const { candidates, total } = await listByFilters(
      database,
      sort,
      filterSql,
      limit
    );
    return {
      results: await buildResults(database, candidates, parsed),
      total,
    };
  }

  const candidates = await findCandidates(database, parsed, filters, filterSql);
  candidates.sort(compareCandidates(sort));
  return {
    results: await buildResults(database, candidates.slice(0, limit), parsed),
    total: candidates.length,
  };
};

// For each distinct folded needle, the starts of its matches in `text`, so
// the passages of one page do not each rescan the whole body.
const occurrenceCounter = (text: string) => {
  const starts = new Map<string, number[]>();
  return (needle: string, before: number): number => {
    const key = foldSearchText(needle);
    let list = starts.get(key);
    if (!list) {
      list = findSubstringMatches(text, needle).map((range) => range.start);
      starts.set(key, list);
    }
    let count = 0;
    for (const start of list) {
      if (start >= before) {
        break;
      }
      count++;
    }
    return count;
  };
};

const buildPassages = (
  text: string,
  ranges: SearchTextRange[],
  source: NodeSearchPassage['source'],
  budget: number
): { passages: NodeSearchPassage[]; truncated: boolean } => {
  const passages: NodeSearchPassage[] = [];
  const countBefore = source === 'content' ? occurrenceCounter(text) : null;

  let index = 0;
  let minStart = 0;
  while (index < ranges.length) {
    if (passages.length >= budget) {
      return { passages, truncated: true };
    }
    const excerpt = buildSearchExcerpt(text, ranges, index, { minStart });
    if (!excerpt) {
      break;
    }
    const range = ranges[index]!;
    const findText = countBefore ? text.slice(range.start, range.end) : null;
    passages.push({
      text: excerpt.text,
      highlights: excerpt.highlights,
      findText,
      findOccurrence:
        countBefore && findText ? countBefore(findText, range.start) : null,
      source,
    });

    minStart = excerpt.sourceEnd;
    let next = index + 1;
    while (next < ranges.length && ranges[next]!.end <= excerpt.sourceEnd) {
      next++;
    }
    index = next;
  }
  return { passages, truncated: false };
};

export const buildNodeSearchPreview = async (
  database: WorkspaceDb,
  nodeId: string,
  searchQuery: string
): Promise<NodeSearchPreview | null> => {
  const row = await database
    .selectFrom('nodes')
    .selectAll()
    .where('id', '=', nodeId)
    .executeTakeFirst();
  if (!row) {
    return null;
  }

  const attributes = JSON.parse(row.attributes) as NodeAttributes;
  const name = nameOf(attributes);
  const { values, bodies } = await fetchTexts(database, [nodeId]);
  const valuesText = values.get(nodeId) ?? null;
  const body = bodies.get(nodeId) ?? null;

  const parsed = parseSearchQuery(searchQuery);
  const nameMatches = findSearchMatches(name, parsed);
  const valueMatches = findSearchMatches(valuesText, parsed);
  const bodyMatches = findSearchMatches(body, parsed);

  const fromValues =
    valuesText && valueMatches.length > 0
      ? buildPassages(valuesText, valueMatches, 'values', PREVIEW_MAX_PASSAGES)
      : { passages: [], truncated: false };
  const fromBody =
    body && bodyMatches.length > 0
      ? buildPassages(
          body,
          bodyMatches,
          'content',
          PREVIEW_MAX_PASSAGES - fromValues.passages.length
        )
      : { passages: [], truncated: false };

  const matchCount =
    nameMatches.length + valueMatches.length + bodyMatches.length;

  return {
    id: row.id,
    type: row.type,
    name,
    avatar: avatarOf(attributes),
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    wordCount: countWords(body),
    opening:
      valueMatches.length + bodyMatches.length === 0
        ? buildTextOpening(body ?? valuesText)
        : null,
    matchCount,
    passages: [...fromValues.passages, ...fromBody.passages],
    passagesTruncated: fromValues.truncated || fromBody.truncated,
  };
};
