import { describe, expect, it } from 'vitest';

import {
  databaseViewAttributesSchema,
  DatabaseViewLayout,
} from '@colanode/core/registry/nodes/database-view';

const buildAttributes = (layout: string) => ({
  type: 'database_view',
  parentId: 'db1',
  layout,
  name: 'View',
  index: 'a0',
});

describe('databaseViewAttributesSchema.layout', () => {
  const layouts: DatabaseViewLayout[] = [
    'table',
    'board',
    'calendar',
    'gallery',
    'list',
    'chart',
    'timeline',
  ];

  it.each(layouts)('accepts %s layout', (layout) => {
    const result = databaseViewAttributesSchema.safeParse(
      buildAttributes(layout)
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layout).toBe(layout);
    }
  });

  it('rejects unknown layouts', () => {
    // Was 'timeline' until the timeline layout shipped, at which point this
    // test was asserting that a real layout is rejected. Any string that is
    // not a layout does the job; this one is not on the roadmap.
    expect(
      databaseViewAttributesSchema.safeParse(buildAttributes('spreadsheet'))
        .success
    ).toBe(false);
  });

  it('accepts gallery layout with field visibility config', () => {
    const result = databaseViewAttributesSchema.safeParse({
      ...buildAttributes('gallery'),
      fields: {
        f1: { id: 'f1', display: true },
        f2: { id: 'f2', display: false },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fields?.f1?.display).toBe(true);
      expect(result.data.fields?.f2?.display).toBe(false);
    }
  });
});
