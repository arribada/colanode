import { runMutation, Tool } from '@colanode/agent-tools';

export const deleteNodeTool: Tool = {
  name: 'colanode_delete_node',
  description:
    'Delete a node by id. WARNING: deleting a root node (a channel, page, or ' +
    'database) cascades to all of its descendants. Requires an explicit node_id.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      node_id: { type: 'string' },
    },
    required: ['node_id'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(args.workspace_id as string | undefined);
    await runMutation(ctx, {
      type: 'node.delete',
      userId,
      nodeId: args.node_id as string,
    });
    return `Deleted node ${args.node_id as string} (descendants cascade).`;
  },
};
