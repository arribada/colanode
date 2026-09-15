import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';

import { wikiToolDefinitions } from '@colanode/server/lib/ai/tools';

// The MCP server's tools/list is built from these definitions with
// z.toJSONSchema, and the in-app agent reads the same array: a schema that
// cannot be converted breaks tools/list for every tool at once.
describe('wiki tool manifest', () => {
  const names = wikiToolDefinitions.map((definition) => definition.name);

  it('has one definition per name, including the read tools', () => {
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_pages',
        'get_page',
        'list_children',
        'get_whiteboard',
        'query_database',
        'list_trash',
        'restore_node',
      ])
    );
  });

  it('says in every description what the tool returns', () => {
    for (const definition of wikiToolDefinitions) {
      expect(definition.description, definition.name).toMatch(/Returns [[{]/);
    }
  });

  it('converts every input schema to JSON Schema with each field described', () => {
    for (const definition of wikiToolDefinitions) {
      const schema = z.toJSONSchema(definition.inputSchema) as {
        type?: string;
        properties?: Record<string, { description?: string }>;
      };
      expect(schema.type, definition.name).toBe('object');
      for (const [field, property] of Object.entries(schema.properties ?? {})) {
        expect(
          property.description,
          `${definition.name}.${field}`
        ).toBeTruthy();
      }
    }
  });
});
