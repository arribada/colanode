import { extractBlocksMentions } from '@colanode/core';

// content is a message node's block map (LocalNode.attributes.content). Typed
// loosely here because the bot only forwards it to the core helper.
export const findBotMention = (
  nodeId: string,
  content: Record<string, unknown> | null | undefined,
  botUserIds: Set<string>
): boolean => {
  if (!content) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mentions = extractBlocksMentions(nodeId, content as any);
  return mentions.some((mention) => botUserIds.has(mention.target));
};
