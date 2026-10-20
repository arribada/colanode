import { describe, expect, it } from 'vitest';

import { FieldAttributes } from '@colanode/core';
import {
  foldSearchText,
  matchRecordIds,
  parseSearchWords,
  recordSearchText,
  sameIds,
  type RecordSearchLookups,
  type SearchableRecord,
} from '@colanode/ui/lib/record-search';

const fields: FieldAttributes[] = [
  { id: 'notes', type: 'text', name: 'Notes', index: 'a0' },
  {
    id: 'status',
    type: 'select',
    name: 'Status',
    index: 'a1',
    options: {
      opt_done: { id: 'opt_done', name: 'Done', color: 'green', index: 'a0' },
      opt_todo: { id: 'opt_todo', name: 'To do', color: 'gray', index: 'a1' },
    },
  },
  {
    id: 'tags',
    type: 'multi_select',
    name: 'Tags',
    index: 'a2',
    options: {
      tag_lora: { id: 'tag_lora', name: 'LoRa', color: 'blue', index: 'a0' },
      tag_gps: { id: 'tag_gps', name: 'GPS', color: 'red', index: 'a1' },
    },
  },
  { id: 'owner', type: 'collaborator', name: 'Owner', index: 'a3' },
  { id: 'author', type: 'created_by', name: 'Author', index: 'a4' },
  { id: 'qty', type: 'number', name: 'Quantity', index: 'a5' },
  { id: 'due', type: 'date', name: 'Due', index: 'a6' },
  { id: 'parent', type: 'relation', name: 'Parent', index: 'a7' },
];

const lookups: RecordSearchLookups = {
  userName: (id) => ({ u_geo: 'Geoffrey Fournier', u_ruby: 'Ruby' })[id],
  recordName: (id) => ({ r_cyprus: 'Cyprus boats' })[id],
};

const record = (
  id: string,
  name: string,
  values: Record<string, unknown> = {},
  createdBy = 'u_ruby'
): SearchableRecord => ({
  id,
  name,
  createdBy,
  fields: Object.fromEntries(
    Object.entries(values).map(([fieldId, value]) => [fieldId, { value }])
  ),
});

const records: SearchableRecord[] = [
  record('r1', 'Éclosion des tortues', {
    notes: 'Nesting beach survey',
    status: 'opt_done',
    tags: ['tag_gps'],
    qty: 42,
  }),
  record('r2', 'Gateway noise test', {
    status: 'opt_todo',
    tags: ['tag_lora', 'tag_gps'],
    owner: ['u_geo'],
    parent: ['r_cyprus'],
  }),
  record('r3', 'Battery budget', { due: '2026-10-20T00:00:00.000Z' }, 'u_geo'),
];

const search = (query: string) =>
  matchRecordIds(records, fields, query, lookups);

describe('parseSearchWords', () => {
  it('splits on any whitespace and drops the empty words', () => {
    expect(parseSearchWords('  LoRa\tgateway \n ')).toEqual([
      'lora',
      'gateway',
    ]);
  });

  it('folds accents and case', () => {
    expect(foldSearchText('Éclosion ÇA')).toBe('eclosion ca');
  });
});

describe('matchRecordIds', () => {
  it('does not narrow the view while nothing is typed', () => {
    expect(search('')).toBeNull();
    expect(search('   ')).toBeNull();
  });

  it('finds a record by its name without minding case or accents', () => {
    expect(search('eclosion')).toEqual(['r1']);
    expect(search('ÉCLOSION')).toEqual(['r1']);
  });

  it('matches inside a word, not only at its start', () => {
    expect(search('tortue')).toEqual(['r1']);
    expect(search('oise')).toEqual(['r2']);
  });

  it('searches text values', () => {
    expect(search('beach')).toEqual(['r1']);
  });

  it('reads the option name of a select, never its id', () => {
    expect(search('done')).toEqual(['r1']);
    expect(search('opt_done')).toEqual([]);
  });

  it('reads every option name of a multi-select', () => {
    expect(search('gps')).toEqual(['r1', 'r2']);
    expect(search('lora')).toEqual(['r2']);
  });

  it('reads the names of collaborators and of the record author', () => {
    expect(search('fournier')).toEqual(['r2', 'r3']);
  });

  it('reads the name of a linked record', () => {
    expect(search('cyprus')).toEqual(['r2']);
  });

  it('matches numbers as they are written', () => {
    expect(search('42')).toEqual(['r1']);
  });

  it('leaves dates out so a number does not find every dated record', () => {
    expect(search('2026')).toEqual([]);
  });

  it('requires every word, in any field and any order', () => {
    expect(search('gps todo')).toEqual([]);
    expect(search('gps fournier')).toEqual(['r2']);
    expect(search('gateway lora')).toEqual(['r2']);
    expect(search('lora gateway')).toEqual(['r2']);
  });

  it('returns an empty list, not null, when nothing matches', () => {
    expect(search('zebra')).toEqual([]);
  });
});

describe('recordSearchText', () => {
  it('only reads the fields the database still has', () => {
    const orphan = record('r9', 'Orphan', { gone: 'secret' });
    expect(recordSearchText(orphan, fields, lookups)).not.toContain('secret');
  });
});

describe('sameIds', () => {
  it('compares two id lists by content', () => {
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameIds(['a'], ['a', 'b'])).toBe(false);
    expect(sameIds(null, null)).toBe(true);
    expect(sameIds([], null)).toBe(false);
  });
});
