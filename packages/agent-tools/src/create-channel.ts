import { runMutation, Tool } from '@colanode/agent-tools/registry';
import { ChannelAttributes, generateId, IdType } from '@colanode/core';

export const buildChannelAttributes = (
  name: string,
  parentId: string,
  avatar?: string
): ChannelAttributes => ({
  type: 'channel',
  name,
  parentId,
  avatar: avatar ?? null,
});

export const createChannelTool: Tool = {
  name: 'colanode_create_channel',
  description: 'Create a channel under a space. Returns the new channel id.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      parent_id: {
        type: 'string',
        description: 'Space to nest the channel under',
      },
      name: { type: 'string' },
      avatar: { type: 'string' },
    },
    required: ['parent_id', 'name'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const nodeId = generateId(IdType.Channel);
    await runMutation(ctx, {
      type: 'node.create',
      userId,
      nodeId,
      attributes: buildChannelAttributes(
        args.name as string,
        args.parent_id as string,
        args.avatar as string | undefined
      ),
    });
    return `Created channel ${nodeId}`;
  },
};
