import { runMutation, Tool } from '@colanode/agent-tools/registry';
import { PageAttributes } from '@colanode/core';

export const updatePageTool: Tool = {
  name: 'colanode_update_page',
  description:
    'Update a page: rename it, change its avatar, or move it under a new ' +
    'parent (parent_id). Only the fields you pass change.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      page_id: { type: 'string' },
      name: { type: 'string' },
      avatar: { type: 'string' },
      parent_id: { type: 'string', description: 'New parent (move the page)' },
    },
    required: ['page_id'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const pageId = args.page_id as string;

    const nodes = await ctx.app.mediator.executeQuery({
      type: 'node.list',
      userId,
      filters: [{ field: ['id'], operator: 'eq', value: pageId }] as never,
      sorts: [],
      limit: 1,
    });
    const current = nodes[0];
    if (!current || current.type !== 'page') {
      throw new Error(`Page ${pageId} not found`);
    }
    const next: PageAttributes = {
      type: 'page',
      name: (args.name as string | undefined) ?? current.name,
      avatar:
        args.avatar !== undefined
          ? (args.avatar as string)
          : (current.avatar ?? null),
      parentId: (args.parent_id as string | undefined) ?? current.parentId,
    };
    await runMutation(ctx, {
      type: 'node.update',
      userId,
      nodeId: pageId,
      attributes: next,
    });
    return `Updated page ${pageId}`;
  },
};
