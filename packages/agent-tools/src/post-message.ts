import { JSONContent } from '@tiptap/core';

import { runMutation, Tool } from '@colanode/agent-tools/registry';

export const textToContent = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

export const postMessageTool: Tool = {
  name: 'colanode_post_message',
  description:
    'Post a text message into a channel, chat, or thread by its node id ' +
    '(parent_id). Optionally reply to / quote a message via reference_id.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      parent_id: {
        type: 'string',
        description: 'Channel / chat / thread node id to post into',
      },
      text: { type: 'string' },
      reference_id: { type: 'string' },
    },
    required: ['parent_id', 'text'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const result = await runMutation(ctx, {
      type: 'message.create',
      userId,
      parentId: args.parent_id as string,
      content: textToContent(args.text as string),
      referenceId: args.reference_id as string | undefined,
    });
    return `Posted message ${result.output.id}`;
  },
};
