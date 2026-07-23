import { describe, expect, it } from 'vitest';

import { extractBlocksMentions } from '@colanode/core/lib/mentions';
import { Block } from '@colanode/core/registry/block';
import { RichTextContent } from '@colanode/core/registry/documents/rich-text';
import { messageModel } from '@colanode/core/registry/nodes/message';
import { pageModel } from '@colanode/core/registry/nodes/page';
import { recordModel } from '@colanode/core/registry/nodes/record';

const userMentionLeaf = (mentionId: string, userId: string) => ({
  type: 'mention',
  attrs: { id: mentionId, target: userId },
});

const makeBlocks = (documentId: string): Record<string, Block> => ({
  block1: {
    id: 'block1',
    type: 'paragraph',
    parentId: documentId,
    index: 'a0',
    content: [
      { type: 'text', text: 'hello ' },
      userMentionLeaf('mention1me', 'user1us'),
    ],
  },
  block2: {
    id: 'block2',
    type: 'blockquote',
    parentId: documentId,
    index: 'a1',
  },
  block3: {
    id: 'block3',
    type: 'paragraph',
    parentId: 'block2',
    index: 'a0',
    content: [
      userMentionLeaf('mention2me', 'user2us'),
      { type: 'text', text: ' and a page link ' },
      userMentionLeaf('mention3me', 'page1pg'),
    ],
  },
});

describe('extractBlocksMentions', () => {
  it('returns empty array when blocks are missing', () => {
    expect(extractBlocksMentions('doc1', null)).toEqual([]);
    expect(extractBlocksMentions('doc1', undefined)).toEqual([]);
    expect(extractBlocksMentions('doc1', {})).toEqual([]);
  });

  it('collects user and node mentions from nested blocks in order', () => {
    const mentions = extractBlocksMentions('doc1', makeBlocks('doc1'));

    expect(mentions).toEqual([
      { id: 'mention1me', target: 'user1us' },
      { id: 'mention2me', target: 'user2us' },
      { id: 'mention3me', target: 'page1pg' },
    ]);
  });

  it('ignores leaves without target or id', () => {
    const blocks: Record<string, Block> = {
      block1: {
        id: 'block1',
        type: 'paragraph',
        parentId: 'doc1',
        index: 'a0',
        content: [
          { type: 'mention', attrs: { id: 'mention1me' } },
          { type: 'mention', attrs: { target: 'user1us' } },
          { type: 'text', text: 'plain' },
        ],
      },
    };

    expect(extractBlocksMentions('doc1', blocks)).toEqual([]);
  });
});

describe('pageModel.extractDocumentMentions', () => {
  it('extracts mentions from a page document', () => {
    const content: RichTextContent = {
      type: 'rich_text',
      blocks: makeBlocks('page1pg'),
    };

    const mentions = pageModel.extractDocumentMentions?.('page1pg', content);

    expect(mentions).toEqual([
      { id: 'mention1me', target: 'user1us' },
      { id: 'mention2me', target: 'user2us' },
      { id: 'mention3me', target: 'page1pg' },
    ]);
  });

  it('extractMentions over attributes stays empty (page content lives in the document)', () => {
    expect(
      pageModel.extractMentions('page1pg', {
        type: 'page',
        name: 'A page',
        parentId: 'space1sp',
      })
    ).toEqual([]);
  });
});

describe('recordModel.extractDocumentMentions', () => {
  it('extracts mentions from a record document', () => {
    const content: RichTextContent = {
      type: 'rich_text',
      blocks: makeBlocks('record1rc'),
    };

    const mentions = recordModel.extractDocumentMentions?.('record1rc', content);

    expect(mentions).toEqual([
      { id: 'mention1me', target: 'user1us' },
      { id: 'mention2me', target: 'user2us' },
      { id: 'mention3me', target: 'page1pg' },
    ]);
  });
});

describe('messageModel.extractMentions', () => {
  it('extracts mentions from message content attributes', () => {
    const mentions = messageModel.extractMentions('message1ms', {
      type: 'message',
      subtype: 'standard',
      parentId: 'chan1ch',
      content: makeBlocks('message1ms'),
    });

    expect(mentions).toEqual([
      { id: 'mention1me', target: 'user1us' },
      { id: 'mention2me', target: 'user2us' },
      { id: 'mention3me', target: 'page1pg' },
    ]);
  });
});
