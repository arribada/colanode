import { describe, expect, it } from 'vitest';

import {
  buildProjectGraph,
  findProjectRoot,
  ProjectGraphDatabase,
  ProjectGraphInputNode,
  ProjectRegister,
  registersInDocument,
} from './project-graph';

// A small but complete project: three template pages, one sub-page, two
// requirements, two tests, one ADR, plus a record of another project in the
// same database that must stay out.
const select = (value: string) => ({ type: 'string', value });
const relation = (...ids: string[]) => ({ type: 'string_array', value: ids });

const REQ_DB: ProjectGraphDatabase = {
  id: 'dbreq',
  fields: {
    fproj: {
      id: 'fproj',
      name: 'Project',
      type: 'select',
      options: {
        omarlin: { id: 'omarlin', name: 'MARLIN' },
        oother: { id: 'oother', name: 'OTHER' },
      },
    },
    fverby: { id: 'fverby', name: 'Verified by', type: 'relation' },
    fdec: { id: 'fdec', name: 'Decided by', type: 'relation' },
  },
};
const VER_DB: ProjectGraphDatabase = {
  id: 'dbver',
  fields: {
    fproj: {
      id: 'fproj',
      name: 'Project',
      type: 'select',
      options: { vmarlin: { id: 'vmarlin', name: 'MARLIN' } },
    },
    fverifies: { id: 'fverifies', name: 'Verifies', type: 'relation' },
    fresult: {
      id: 'fresult',
      name: 'Result',
      type: 'select',
      options: {
        pass: { id: 'pass', name: 'Pass' },
        fail: { id: 'fail', name: 'Fail' },
      },
    },
  },
};
const ADR_DB: ProjectGraphDatabase = {
  id: 'dbadr',
  fields: {
    fproj: {
      id: 'fproj',
      name: 'Project',
      type: 'select',
      options: { amarlin: { id: 'amarlin', name: 'MARLIN' } },
    },
    fstatus: {
      id: 'fstatus',
      name: 'Status',
      type: 'select',
      options: {
        open: { id: 'open', name: 'Open' },
        done: { id: 'done', name: 'Resolved' },
      },
    },
  },
};

const page = (
  id: string,
  parentId: string,
  role?: string,
  name = id
): ProjectGraphInputNode => ({
  id,
  type: 'page',
  name,
  parentId,
  projectRole: role ?? null,
});
const record = (
  id: string,
  databaseId: string,
  fields: Record<string, unknown>
): ProjectGraphInputNode => ({
  id,
  type: 'record',
  name: id,
  parentId: databaseId,
  databaseId,
  fields,
});

const NODES: ProjectGraphInputNode[] = [
  { id: 'mission', type: 'page', name: 'Mission Fisheries', parentId: 'space' },
  {
    id: 'root',
    type: 'page',
    name: 'MARLIN',
    parentId: 'mission',
    projectCode: 'MARLIN',
  },
  page('preq', 'root', 'requirements'),
  page('ptests', 'root', 'tests'),
  page('pdec', 'root', 'decisions'),
  page('phw', 'root', 'hardware_design'),
  page('phwsub', 'phw', undefined, 'HV stage'),
  page('pextra', 'root', undefined, 'Power budget'),
  record('hw1', 'dbreq', {
    fproj: select('omarlin'),
    fverby: relation('t1'),
    fdec: relation('adr1'),
  }),
  record('hw2', 'dbreq', { fproj: select('omarlin') }),
  record('foreign', 'dbreq', { fproj: select('oother') }),
  record('t1', 'dbver', {
    fproj: select('vmarlin'),
    fverifies: relation('hw1'),
    fresult: select('pass'),
  }),
  record('t2', 'dbver', {
    fproj: select('vmarlin'),
    fverifies: relation('hw2'),
    fresult: select('fail'),
  }),
  record('adr1', 'dbadr', {
    fproj: select('amarlin'),
    fstatus: select('open'),
  }),
];

const REGISTERS: ProjectRegister[] = [
  {
    pageId: 'preq',
    role: 'requirements',
    databaseId: 'dbreq',
    fieldId: 'fproj',
    optionId: 'omarlin',
  },
  {
    pageId: 'ptests',
    role: 'tests',
    databaseId: 'dbver',
    fieldId: 'fproj',
    optionId: 'vmarlin',
  },
  {
    pageId: 'pdec',
    role: 'decisions',
    databaseId: 'dbadr',
    fieldId: 'fproj',
    optionId: 'amarlin',
  },
];

const build = (
  overrides: Partial<Parameters<typeof buildProjectGraph>[0]> = {}
) =>
  buildProjectGraph({
    nodes: NODES,
    references: [{ nodeId: 'phw', referenceId: 'hw1' }],
    registers: REGISTERS,
    databases: [REQ_DB, VER_DB, ADR_DB],
    rootId: 'root',
    ...overrides,
  });

describe('buildProjectGraph', () => {
  it('draws the pages and the project records, not the root nor other projects', () => {
    const graph = build();
    const ids = graph.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(
      [
        'adr1',
        'hw1',
        'hw2',
        'pdec',
        'pextra',
        'phw',
        'phwsub',
        'preq',
        'ptests',
        't1',
        't2',
      ].sort()
    );
  });

  it('puts each node in its lane, sub-pages with their page, unknown pages in design', () => {
    const { lanes } = build();
    expect(lanes.preq).toBe('requirements');
    expect(lanes.hw1).toBe('requirements');
    expect(lanes.ptests).toBe('verification');
    expect(lanes.t1).toBe('verification');
    expect(lanes.pdec).toBe('decisions');
    expect(lanes.adr1).toBe('decisions');
    expect(lanes.phw).toBe('design');
    expect(lanes.phwsub).toBe('design');
    expect(lanes.pextra).toBe('design');
  });

  it('draws a relation once even when both sides hold it', () => {
    const relations = build().edges.filter((e) => e.kind === 'relation');
    const pairs = relations.map((e) => [e.from, e.to].sort().join('-')).sort();
    expect(pairs).toEqual(['adr1-hw1', 'hw1-t1', 'hw2-t2']);
  });

  it('keeps mentions between project nodes and hangs records from their register page', () => {
    const graph = build();
    expect(graph.edges).toContainEqual({
      from: 'phw',
      to: 'hw1',
      kind: 'link',
    });
    expect(graph.edges).toContainEqual({
      from: 'preq',
      to: 'hw1',
      kind: 'hierarchy',
    });
    expect(graph.edges).toContainEqual({
      from: 'phw',
      to: 'phwsub',
      kind: 'hierarchy',
    });
    expect(graph.edges.some((e) => e.from === 'root' || e.to === 'root')).toBe(
      false
    );
  });

  it('counts coverage from the relations and the test results', () => {
    expect(build().project?.coverage).toEqual({
      requirements: 2,
      tested: 2,
      passed: 1,
      failing: 1,
      tests: 2,
      decisions: 1,
      openDecisions: 1,
    });
  });

  it('counts an untested requirement as untested', () => {
    const nodes = NODES.map((n) =>
      n.id === 't2'
        ? {
            ...n,
            fields: { fproj: select('vmarlin'), fresult: select('fail') },
          }
        : n
    ).map((n) =>
      n.id === 'hw2' ? { ...n, fields: { fproj: select('omarlin') } } : n
    );
    const coverage = build({ nodes }).project!.coverage;
    expect(coverage.tested).toBe(1);
    expect(coverage.failing).toBe(0);
  });

  it('returns nothing for a page that is not a project root', () => {
    expect(build({ rootId: 'mission' }).project).toBeNull();
  });

  it('ignores a register embedded outside the project', () => {
    const graph = build({
      registers: [{ ...REGISTERS[0]!, pageId: 'elsewhere' }],
    });
    expect(graph.nodes.some((n) => n.id === 'hw1')).toBe(false);
  });
});

describe('findProjectRoot', () => {
  it('walks up from any page of the project to its root', () => {
    const byId = new Map(NODES.map((n) => [n.id, n]));
    expect(findProjectRoot(byId, 'phwsub')?.id).toBe('root');
    expect(findProjectRoot(byId, 'root')?.id).toBe('root');
    expect(findProjectRoot(byId, 'mission')).toBeNull();
  });
});

describe('registersInDocument', () => {
  it('finds the filtered database embeds of a page', () => {
    const content = {
      type: 'rich_text',
      blocks: {
        dbreq: {
          id: 'dbreq',
          type: 'database',
          parentId: 'preq',
          index: 'a1',
          attrs: {
            inline: true,
            filterFieldId: 'fproj',
            filterValue: 'omarlin',
          },
        },
        plain: {
          id: 'dbx',
          type: 'database',
          parentId: 'preq',
          index: 'a2',
          attrs: { inline: true },
        },
        para: { id: 'p1', type: 'paragraph', parentId: 'preq', index: 'a0' },
      },
    };
    expect(registersInDocument('preq', 'requirements', content)).toEqual([
      {
        pageId: 'preq',
        role: 'requirements',
        databaseId: 'dbreq',
        fieldId: 'fproj',
        optionId: 'omarlin',
      },
    ]);
    expect(registersInDocument('preq', 'requirements', null)).toEqual([]);
  });
});
