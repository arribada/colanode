// ABOUTME: Unit tests for the reference-remapping logic behind duplicating a
// ABOUTME: page subtree (databases + records + whiteboards + relations).

import { describe, expect, it } from 'vitest';

import {
  DatabaseAttributes,
  FolderAttributes,
  IdType,
  PageAttributes,
  RecordAttributes,
  WhiteboardAttributes,
} from '@colanode/core';

import {
  buildDescendantAttributes,
  idTypeForNodeType,
  remapDatabaseFields,
  remapRecordFields,
} from './node-subtree-copy';

describe('idTypeForNodeType', () => {
  it('maps each copyable node type to its id type', () => {
    expect(idTypeForNodeType('page')).toBe(IdType.Page);
    expect(idTypeForNodeType('database')).toBe(IdType.Database);
    expect(idTypeForNodeType('database_view')).toBe(IdType.DatabaseView);
    expect(idTypeForNodeType('record')).toBe(IdType.Record);
    expect(idTypeForNodeType('whiteboard')).toBe(IdType.Whiteboard);
    expect(idTypeForNodeType('folder')).toBe(IdType.Folder);
    expect(idTypeForNodeType('file')).toBe(IdType.File);
  });
});

describe('remapRecordFields', () => {
  it('remaps relation ids that are in the map, leaving every other value', () => {
    const map = new Map([
      ['rc_old1', 'rc_new1'],
      ['rc_old2', 'rc_new2'],
    ]);
    const fields: RecordAttributes['fields'] = {
      rel: {
        type: 'string_array',
        value: ['rc_old1', 'rc_outside', 'rc_old2'],
      },
      single: { type: 'string', value: 'rc_old1' },
      title: { type: 'string', value: 'Just text, not an id' },
      count: { type: 'number', value: 42 },
      done: { type: 'boolean', value: true },
    };

    const out = remapRecordFields(fields, map);

    // In-subtree relation ids are remapped; an outside id is left alone.
    expect(out.rel).toEqual({
      type: 'string_array',
      value: ['rc_new1', 'rc_outside', 'rc_new2'],
    });
    expect(out.single).toEqual({ type: 'string', value: 'rc_new1' });
    // A plain text value that isn't an id is untouched.
    expect(out.title).toEqual({ type: 'string', value: 'Just text, not an id' });
    expect(out.count).toEqual({ type: 'number', value: 42 });
    expect(out.done).toEqual({ type: 'boolean', value: true });
  });
});

describe('remapDatabaseFields', () => {
  it('remaps a relation field target databaseId only when it is in the map', () => {
    const map = new Map([['db_old', 'db_new']]);
    const fields = {
      f1: { id: 'f1', type: 'relation', name: 'Rel', index: 'a', databaseId: 'db_old' },
      f2: { id: 'f2', type: 'relation', name: 'RelOut', index: 'b', databaseId: 'db_elsewhere' },
    } as DatabaseAttributes['fields'];

    const out = remapDatabaseFields(fields, map);

    expect((out.f1 as { databaseId?: string }).databaseId).toBe('db_new');
    expect((out.f2 as { databaseId?: string }).databaseId).toBe('db_elsewhere');
  });
});

describe('buildDescendantAttributes', () => {
  const map = new Map([
    ['db_old', 'db_new'],
    ['rc_ref', 'rc_ref_new'],
  ]);

  it('strips isTemplate and reparents a page', () => {
    const attrs: PageAttributes = {
      type: 'page',
      name: 'P',
      parentId: 'old',
      isTemplate: true,
    };
    const out = buildDescendantAttributes(attrs, 'newparent', map);
    if (out.type !== 'page') throw new Error('expected a page');
    expect(out.parentId).toBe('newparent');
    expect(out.isTemplate).toBeUndefined();
  });

  it('reparents a record, remaps databaseId + relation values, strips isTemplate', () => {
    const attrs: RecordAttributes = {
      type: 'record',
      name: 'R',
      parentId: 'db_old',
      databaseId: 'db_old',
      isTemplate: true,
      fields: { rel: { type: 'string_array', value: ['rc_ref', 'rc_out'] } },
    };
    const out = buildDescendantAttributes(attrs, 'db_new', map);
    if (out.type !== 'record') throw new Error('expected a record');
    expect(out.parentId).toBe('db_new');
    expect(out.databaseId).toBe('db_new');
    expect(out.fields.rel).toEqual({
      type: 'string_array',
      value: ['rc_ref_new', 'rc_out'],
    });
    expect(out.isTemplate).toBeUndefined();
  });

  it('copies a whiteboard scene verbatim and reparents it', () => {
    const scene = {
      el1: { id: 'el1', type: 'rect', x: 0, y: 0, w: 10, h: 10, z: 'a', style: {} },
    } as WhiteboardAttributes['scene'];
    const attrs: WhiteboardAttributes = {
      type: 'whiteboard',
      name: 'WB',
      parentId: 'old',
      scene,
    };
    const out = buildDescendantAttributes(attrs, 'newparent', map);
    if (out.type !== 'whiteboard') throw new Error('expected a whiteboard');
    expect(out.parentId).toBe('newparent');
    expect(out.scene).toBe(scene);
  });

  it('remaps a database relation field and reparents it', () => {
    const attrs: DatabaseAttributes = {
      type: 'database',
      name: 'DB',
      parentId: 'old',
      fields: {
        f1: { id: 'f1', type: 'relation', name: 'Rel', index: 'a', databaseId: 'db_old' },
      } as DatabaseAttributes['fields'],
    };
    const out = buildDescendantAttributes(attrs, 'newparent', map);
    if (out.type !== 'database') throw new Error('expected a database');
    expect(out.parentId).toBe('newparent');
    expect((out.fields.f1 as { databaseId?: string }).databaseId).toBe('db_new');
  });

  it('reparents a folder', () => {
    const attrs: FolderAttributes = { type: 'folder', name: 'F', parentId: 'old' };
    const out = buildDescendantAttributes(attrs, 'newparent', map);
    if (out.type !== 'folder') throw new Error('expected a folder');
    expect(out.parentId).toBe('newparent');
  });
});
