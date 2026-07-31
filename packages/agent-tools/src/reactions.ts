import { runMutation, Tool } from '@colanode/agent-tools/registry';

export const addReactionTool: Tool = {
  name: 'colanode_add_reaction',
  description: 'Add an emoji reaction to a node (e.g. a message).',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      node_id: { type: 'string' },
      reaction: { type: 'string', description: 'Emoji, e.g. 👍' },
    },
    required: ['node_id', 'reaction'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(args.workspace_id as string | undefined);
    await runMutation(ctx, {
      type: 'node.reaction.create',
      userId,
      nodeId: args.node_id as string,
      reaction: args.reaction as string,
    });
    return `Added reaction to ${args.node_id as string}`;
  },
};

export const removeReactionTool: Tool = {
  name: 'colanode_remove_reaction',
  description: 'Remove an emoji reaction from a node.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      node_id: { type: 'string' },
      reaction: { type: 'string' },
    },
    required: ['node_id', 'reaction'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(args.workspace_id as string | undefined);
    await runMutation(ctx, {
      type: 'node.reaction.delete',
      userId,
      nodeId: args.node_id as string,
      reaction: args.reaction as string,
    });
    return `Removed reaction from ${args.node_id as string}`;
  },
};
