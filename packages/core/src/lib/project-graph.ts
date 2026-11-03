// ABOUTME: The project graph — a template project's pages and register records in
// ABOUTME: lanes (requirements, design, decisions, tests), with coverage. Pure.
import {
  ownProjectLane,
  ProjectLane,
} from '@colanode/core/lib/project-template';

// The same shape as the knowledge graph the client draws (client lib/graph),
// so a project graph goes through the same canvas. Kept here because the
// server builds it too, and the server does not depend on the client.
export interface ProjectGraphNode {
  id: string;
  type: string;
  name: string;
  degree: number;
}

export interface ProjectGraphEdge {
  from: string;
  to: string;
  kind: 'link' | 'hierarchy' | 'relation';
  // The relation field's name, for a 'relation' edge.
  label?: string;
}

export interface ProjectGraphInputNode {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  projectCode?: string | null;
  projectRole?: string | null;
  // A role-less page's chosen column (see the page attribute).
  projectLane?: string | null;
  // Root page only: the registers the server declared for the project.
  registers?: Record<
    string,
    { databaseId: string; fieldId: string; optionId: string }
  >;
  // Records only.
  databaseId?: string | null;
  fields?: Record<string, unknown>;
}

// A register embedded on one of the project's pages: the database it shows
// and the filter that makes it this project's.
export interface ProjectRegister {
  pageId: string;
  role: 'requirements' | 'tests' | 'decisions';
  databaseId: string;
  fieldId: string;
  optionId: string;
}

export interface ProjectGraphField {
  id: string;
  name: string;
  type: string;
  options?: Record<string, { id: string; name: string }>;
}

export interface ProjectGraphDatabase {
  id: string;
  fields: Record<string, ProjectGraphField>;
}

export interface ProjectGraphReference {
  nodeId: string;
  referenceId: string;
}

export interface ProjectCoverage {
  requirements: number;
  // Requirements with at least one test linked.
  tested: number;
  // Requirements with at least one linked test whose result is Pass.
  passed: number;
  // Requirements with a linked test whose result is Fail.
  failing: number;
  tests: number;
  decisions: number;
  openDecisions: number;
}

export interface ProjectGraphSummary {
  code: string;
  rootId: string;
  rootName: string;
  coverage: ProjectCoverage;
}

export type ProjectGraph = {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  unresolved: Array<{ from: string; target: string }>;
  // Never set: a project is drawn whole. Present so the canvas reads both
  // kinds of graph the same way.
  truncated?: { shown: number; total: number };
  lanes: Record<string, ProjectLane>;
  project: ProjectGraphSummary | null;
};

const REGISTER_LANE: Record<ProjectRegister['role'], ProjectLane> = {
  requirements: 'requirements',
  tests: 'verification',
  decisions: 'decisions',
};

// The page types a project draws. Databases are left out: a register is
// drawn as its records, and its table would only be a hub in the middle.
const PAGE_TYPES = new Set(['page', 'whiteboard', 'folder']);

const stringValue = (value: unknown): string | null => {
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value: unknown }).value;
    return typeof inner === 'string' ? inner : null;
  }
  return null;
};

const arrayValue = (value: unknown): string[] => {
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value: unknown }).value;
    return Array.isArray(inner)
      ? inner.filter((v): v is string => typeof v === 'string')
      : [];
  }
  return [];
};

// The option name a record has in the select field called `name`, or null.
const selectName = (
  record: ProjectGraphInputNode,
  database: ProjectGraphDatabase | undefined,
  name: string
): string | null => {
  if (!database) {
    return null;
  }
  const field = Object.values(database.fields).find(
    (f) => f.type === 'select' && f.name.trim().toLowerCase() === name
  );
  if (!field) {
    return null;
  }
  const optionId = stringValue(record.fields?.[field.id]);
  return optionId ? (field.options?.[optionId]?.name ?? null) : null;
};

export const findProjectRoot = (
  nodes: ReadonlyMap<string, ProjectGraphInputNode>,
  startId: string
): ProjectGraphInputNode | null => {
  let current = nodes.get(startId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.projectCode) {
      return current;
    }
    seen.add(current.id);
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return null;
};

export const buildProjectGraph = (input: {
  nodes: readonly ProjectGraphInputNode[];
  references: readonly ProjectGraphReference[];
  registers: readonly ProjectRegister[];
  databases: readonly ProjectGraphDatabase[];
  rootId: string;
}): ProjectGraph => {
  const byId = new Map(input.nodes.map((node) => [node.id, node]));
  const root = byId.get(input.rootId);
  if (!root || !root.projectCode) {
    return { nodes: [], edges: [], unresolved: [], lanes: {}, project: null };
  }

  const children = new Map<string, ProjectGraphInputNode[]>();
  for (const node of input.nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }

  // The project's pages: everything under the root, each in the lane of its
  // template role, else the lane chosen for it, else the lane of the page it
  // sits under (a sub-page of Hardware design is design).
  const lanes: Record<string, ProjectLane> = {};
  const inScope = new Map<string, ProjectGraphInputNode>();
  const walk = (parentId: string, inherited: ProjectLane | null) => {
    for (const child of children.get(parentId) ?? []) {
      if (!PAGE_TYPES.has(child.type)) continue;
      const lane = ownProjectLane(child)?.lane ?? inherited ?? 'design';
      inScope.set(child.id, child);
      lanes[child.id] = lane;
      walk(child.id, lane);
    }
  };
  walk(root.id, null);

  // The register records: those of each embedded database whose project
  // option is the one the embed filters on.
  const databases = new Map(input.databases.map((db) => [db.id, db]));
  const recordRole = new Map<string, ProjectRegister['role']>();
  const listedOn = new Map<string, string>();
  for (const register of input.registers) {
    if (!inScope.has(register.pageId)) continue;
    for (const node of input.nodes) {
      if (node.type !== 'record' || node.databaseId !== register.databaseId) {
        continue;
      }
      if (stringValue(node.fields?.[register.fieldId]) !== register.optionId) {
        continue;
      }
      if (recordRole.has(node.id)) continue;
      recordRole.set(node.id, register.role);
      listedOn.set(node.id, register.pageId);
      inScope.set(node.id, node);
      lanes[node.id] = REGISTER_LANE[register.role];
    }
  }

  const edgeMap = new Map<string, ProjectGraphEdge>();
  const addEdge = (edge: ProjectGraphEdge, undirected = false) => {
    const key = undirected
      ? `${edge.kind}:${[edge.from, edge.to].sort().join('|')}`
      : `${edge.kind}:${edge.from}>${edge.to}`;
    if (!edgeMap.has(key)) edgeMap.set(key, edge);
  };

  for (const reference of input.references) {
    if (reference.nodeId === reference.referenceId) continue;
    if (!inScope.has(reference.nodeId) || !inScope.has(reference.referenceId)) {
      continue;
    }
    addEdge({
      from: reference.nodeId,
      to: reference.referenceId,
      kind: 'link',
    });
  }

  // Sub-pages hang from their page; records from the page that lists them.
  for (const node of inScope.values()) {
    const parent = listedOn.get(node.id) ?? node.parentId;
    if (parent && parent !== root.id && inScope.has(parent)) {
      addEdge({ from: parent, to: node.id, kind: 'hierarchy' });
    }
  }

  // A relation drawn once, whichever side holds it: "Verified by" on the
  // requirement and "Verifies" on the test are the same link.
  const linked = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = linked.get(a) ?? new Set<string>();
    set.add(b);
    linked.set(a, set);
  };
  for (const [recordId] of recordRole) {
    const record = inScope.get(recordId)!;
    const database = databases.get(record.databaseId ?? '');
    if (!database) continue;
    for (const field of Object.values(database.fields)) {
      if (field.type !== 'relation') continue;
      for (const target of arrayValue(record.fields?.[field.id])) {
        if (!inScope.has(target) || target === recordId) continue;
        addEdge(
          { from: recordId, to: target, kind: 'relation', label: field.name },
          true
        );
        link(recordId, target);
        link(target, recordId);
      }
    }
  }

  const edges = [...edgeMap.values()];
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const nodes: ProjectGraphNode[] = [...inScope.values()].map((node) => ({
    id: node.id,
    type: node.type,
    name: node.name,
    degree: degree.get(node.id) ?? 0,
  }));

  const ofRole = (role: ProjectRegister['role']) =>
    [...recordRole].filter(([, r]) => r === role).map(([id]) => id);
  const resultOf = (testId: string) => {
    const test = inScope.get(testId)!;
    return selectName(test, databases.get(test.databaseId ?? ''), 'result');
  };
  const tests = new Set(ofRole('tests'));
  let tested = 0;
  let passed = 0;
  let failing = 0;
  const requirementIds = ofRole('requirements');
  for (const id of requirementIds) {
    const linkedTests = [...(linked.get(id) ?? [])].filter((t) => tests.has(t));
    if (linkedTests.length === 0) continue;
    tested++;
    const results = linkedTests.map(resultOf);
    if (results.includes('Pass')) passed++;
    if (results.includes('Fail')) failing++;
  }
  const decisionIds = ofRole('decisions');
  const openDecisions = decisionIds.filter((id) => {
    const decision = inScope.get(id)!;
    return (
      selectName(
        decision,
        databases.get(decision.databaseId ?? ''),
        'status'
      ) === 'Open'
    );
  }).length;

  return {
    nodes,
    edges,
    unresolved: [],
    lanes,
    project: {
      code: root.projectCode,
      rootId: root.id,
      rootName: root.name,
      coverage: {
        requirements: requirementIds.length,
        tested,
        passed,
        failing,
        tests: tests.size,
        decisions: decisionIds.length,
        openDecisions,
      },
    },
  };
};

// The registers a project page document embeds: the `database` blocks that
// carry a filter. Read from the document content the client already stores.
export const registersInDocument = (
  pageId: string,
  role: ProjectRegister['role'],
  content: unknown
): ProjectRegister[] => {
  const blocks =
    content && typeof content === 'object' && 'blocks' in content
      ? (content as { blocks?: Record<string, unknown> }).blocks
      : undefined;
  if (!blocks) return [];
  const registers: ProjectRegister[] = [];
  for (const block of Object.values(blocks)) {
    if (!block || typeof block !== 'object') continue;
    const { type, id, attrs } = block as {
      type?: unknown;
      id?: unknown;
      attrs?: Record<string, unknown> | null;
    };
    if (type !== 'database' || typeof id !== 'string' || !attrs) continue;
    const fieldId = attrs.filterFieldId;
    const optionId = attrs.filterValue;
    if (typeof fieldId === 'string' && typeof optionId === 'string') {
      registers.push({ pageId, role, databaseId: id, fieldId, optionId });
    }
  }
  return registers;
};
