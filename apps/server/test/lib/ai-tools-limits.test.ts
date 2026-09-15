import { describe, expect, it } from 'vitest';

import { wikiToolDefinitions } from '@colanode/server/lib/ai/tools';

// Input is refused by its schema before anything is looked up, so neither
// the user nor the workspace needs to exist.
const ctx = { userId: 'nobody', workspaceId: 'nowhere' };
const ID = '01ky60x9fb8x1856afmmf01sw1pg';

const tool = (name: string) =>
  wikiToolDefinitions.find((definition) => definition.name === name)!;

// A tool validates its input before it returns a promise, so a refusal is
// thrown rather than rejected; the agent and the MCP server await the call
// inside a try either way. Deferred, it can be expected as a rejection.
const call = (name: string, input: Record<string, unknown>) =>
  Promise.resolve().then(() => tool(name).run(ctx, input));

describe('input size limits', () => {
  it('refuses a search query over 500 characters before searching', async () => {
    // A 200k-character query took 8.5 s of ILIKE on production.
    await expect(
      call('search_pages', { query: 'x'.repeat(501) })
    ).rejects.toThrow(/500 characters/);
  });

  it('refuses names and filters over 500 characters', async () => {
    const long = 'x'.repeat(501);
    await expect(
      call('create_page', { parentId: ID, name: long })
    ).rejects.toThrow(/500 characters/);
    await expect(call('rename_node', { id: ID, name: long })).rejects.toThrow(
      /500 characters/
    );
    await expect(
      call('upload_image', {
        pageId: ID,
        name: long,
        url: 'https://example.org/a.png',
      })
    ).rejects.toThrow(/500 characters/);
    await expect(
      call('query_database', { databaseId: ID, filter: long })
    ).rejects.toThrow(/500 characters/);
  });

  it('refuses more than 2 MB of markdown at once', async () => {
    const huge = 'x'.repeat(2_000_001);
    await expect(
      call('edit_page', { id: ID, mode: 'append', content: huge })
    ).rejects.toThrow(/2 MB/);
    await expect(
      call('create_page', { parentId: ID, name: 'Big', content: huge })
    ).rejects.toThrow(/2 MB/);
  });

  it('accepts input right at the limits', () => {
    expect(
      tool('search_pages').inputSchema.safeParse({ query: 'x'.repeat(500) })
        .success
    ).toBe(true);
    expect(
      tool('edit_page').inputSchema.safeParse({
        id: ID,
        mode: 'append',
        content: 'x'.repeat(2_000_000),
      }).success
    ).toBe(true);
    expect(
      tool('rename_node').inputSchema.safeParse({
        id: ID,
        name: 'x'.repeat(500),
      }).success
    ).toBe(true);
  });
});
