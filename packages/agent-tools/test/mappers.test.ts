import { describe, expect, it } from 'vitest';

import { buildChannelAttributes } from '@colanode/agent-tools/create-channel';
import { buildPageAttributes } from '@colanode/agent-tools/create-page';
import { buildRecordAttributes } from '@colanode/agent-tools/create-record';
import { buildNodeListInput } from '@colanode/agent-tools/list-nodes';
import { textToContent } from '@colanode/agent-tools/post-message';

describe('buildNodeListInput', () => {
  it('filters by parentId when given', () => {
    const input = buildNodeListInput('us-1', { parentId: 'sp-1' });
    expect(input).toEqual({
      type: 'node.list',
      userId: 'us-1',
      filters: [{ field: ['parentId'], operator: 'eq', value: 'sp-1' }],
      sorts: [],
      limit: 100,
    });
  });

  it('filters by rootId and respects an explicit limit', () => {
    const input = buildNodeListInput('us-1', { rootId: 'sp-9', limit: 10 });
    expect(input.filters).toEqual([
      { field: ['rootId'], operator: 'eq', value: 'sp-9' },
    ]);
    expect(input.limit).toBe(10);
  });

  it('returns no filters when neither parentId nor rootId given', () => {
    expect(buildNodeListInput('us-1', {}).filters).toEqual([]);
  });
});

describe('buildPageAttributes', () => {
  it('builds a page with parentId and optional avatar', () => {
    expect(buildPageAttributes('Notes', 'sp-1')).toEqual({
      type: 'page',
      name: 'Notes',
      parentId: 'sp-1',
      avatar: null,
    });
    expect(buildPageAttributes('Notes', 'sp-1', 'av-9').avatar).toBe('av-9');
  });
});

describe('buildChannelAttributes', () => {
  it('builds a channel with parentId', () => {
    expect(buildChannelAttributes('general', 'sp-1')).toEqual({
      type: 'channel',
      name: 'general',
      parentId: 'sp-1',
      avatar: null,
    });
  });
});

describe('buildRecordAttributes', () => {
  it('sets parentId to the databaseId and includes fields', () => {
    const attrs = buildRecordAttributes('db-1', 'Acme', {});
    expect(attrs).toEqual({
      type: 'record',
      parentId: 'db-1',
      databaseId: 'db-1',
      name: 'Acme',
      avatar: null,
      fields: {},
    });
  });
});

describe('textToContent', () => {
  it('wraps a plain string into a tiptap doc paragraph', () => {
    expect(textToContent('hi')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    });
  });
});
