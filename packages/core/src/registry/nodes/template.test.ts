import { describe, expect, it } from 'vitest';

import {
  isNodeTemplate,
  isTemplatableNodeType,
  templatableNodeTypes,
} from '@colanode/core/lib/nodes';
import { pageAttributesSchema } from '@colanode/core/registry/nodes/page';
import { recordAttributesSchema } from '@colanode/core/registry/nodes/record';

describe('template attributes', () => {
  it('page schema accepts isTemplate true', () => {
    const result = pageAttributesSchema.safeParse({
      type: 'page',
      name: 'Meeting notes',
      parentId: 'sp1',
      isTemplate: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isTemplate).toBe(true);
    }
  });

  it('page schema accepts absence of isTemplate (defaults to falsy)', () => {
    const result = pageAttributesSchema.safeParse({
      type: 'page',
      name: 'Page',
      parentId: 'sp1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isTemplate).toBeUndefined();
    }
  });

  it('record schema accepts isTemplate true alongside fields', () => {
    const result = recordAttributesSchema.safeParse({
      type: 'record',
      parentId: 'db1',
      databaseId: 'db1',
      name: 'Weekly report',
      fields: {
        field1: { type: 'string', value: 'Draft' },
      },
      isTemplate: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isTemplate).toBe(true);
      expect(result.data.fields.field1).toEqual({
        type: 'string',
        value: 'Draft',
      });
    }
  });

  it('record schema accepts absence of isTemplate', () => {
    const result = recordAttributesSchema.safeParse({
      type: 'record',
      parentId: 'db1',
      databaseId: 'db1',
      name: 'Record',
      fields: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isTemplate).toBeUndefined();
    }
  });
});

describe('isTemplatableNodeType', () => {
  it('page and record are templatable', () => {
    for (const type of ['page', 'record'] as const) {
      expect(isTemplatableNodeType(type)).toBe(true);
      expect(templatableNodeTypes).toContain(type);
    }
  });

  it('other node types are not templatable', () => {
    for (const type of [
      'space',
      'channel',
      'chat',
      'message',
      'database',
      'database_view',
      'folder',
      'file',
      'whiteboard',
    ] as const) {
      expect(isTemplatableNodeType(type)).toBe(false);
    }
  });
});

describe('isNodeTemplate', () => {
  it('detects a template node by attributes', () => {
    expect(
      isNodeTemplate({
        type: 'page',
        name: 'Page',
        parentId: 'sp1',
        isTemplate: true,
      })
    ).toBe(true);
  });

  it('does not flag nodes without isTemplate, or with it false/null', () => {
    expect(
      isNodeTemplate({ type: 'page', name: 'Page', parentId: 'sp1' })
    ).toBe(false);
    expect(isNodeTemplate({ isTemplate: false })).toBe(false);
    expect(isNodeTemplate({ isTemplate: null })).toBe(false);
  });
});
