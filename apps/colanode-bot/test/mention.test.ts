import { describe, expect, it } from 'vitest';

import { findBotMention } from '@colanode/bot/mention';
import { generateId, IdType } from '@colanode/core';

// A message's content is a map of blockId → block; a block has a content array
// of leaves; a mention leaf is { type: 'mention', attrs: { id, target } }.
const messageContent = (targetUserId: string) => {
  const blockId = generateId(IdType.Block);
  return {
    [blockId]: {
      id: blockId,
      type: 'paragraph',
      parentId: 'ms-1',
      index: 'a',
      content: [
        {
          type: 'mention',
          attrs: { id: generateId(IdType.Mention), target: targetUserId },
        },
        { type: 'text', text: ' hello' },
      ],
    },
  };
};

describe('findBotMention', () => {
  const botIds = new Set(['us-bot']);

  it('returns true when a mention targets a bot userId', () => {
    expect(findBotMention('ms-1', messageContent('us-bot'), botIds)).toBe(true);
  });

  it('returns false when the mention targets someone else', () => {
    expect(findBotMention('ms-1', messageContent('us-other'), botIds)).toBe(
      false
    );
  });

  it('returns false when there is no content', () => {
    expect(findBotMention('ms-1', null, botIds)).toBe(false);
  });
});
