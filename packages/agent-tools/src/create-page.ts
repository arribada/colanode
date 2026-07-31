import { runMutation, Tool } from '@colanode/agent-tools/registry';
import { generateId, IdType, PageAttributes } from '@colanode/core';

export const buildPageAttributes = (
  name: string,
  parentId: string,
  avatar?: string
): PageAttributes => ({
  type: 'page',
  name,
  parentId,
  avatar: avatar ?? null,
});

export const createPageTool: Tool = {
  name: 'colanode_create_page',
  description:
    'Create a page under a parent node (a space, or another page). Returns the ' +
    'new page id.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      parent_id: { type: 'string', description: 'Space or page to nest under' },
      name: { type: 'string' },
      avatar: { type: 'string' },
    },
    required: ['parent_id', 'name'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const nodeId = generateId(IdType.Page);
    await runMutation(ctx, {
      type: 'node.create',
      userId,
      nodeId,
      attributes: buildPageAttributes(
        args.name as string,
        args.parent_id as string,
        args.avatar as string | undefined
      ),
    });
    return `Created page ${nodeId}`;
  },
};
