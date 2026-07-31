import { Tool } from '@colanode/agent-tools/registry';
import { NodeListQueryInput } from '@colanode/client/queries/nodes/node-list';

export const buildNodeListInput = (
  userId: string,
  opts: { parentId?: string; rootId?: string; limit?: number }
): NodeListQueryInput => {
  const filters = [];
  if (opts.parentId) {
    filters.push({ field: ['parentId'], operator: 'eq', value: opts.parentId });
  } else if (opts.rootId) {
    filters.push({ field: ['rootId'], operator: 'eq', value: opts.rootId });
  }
  return {
    type: 'node.list',
    userId,
    filters: filters as unknown as NodeListQueryInput['filters'],
    sorts: [],
    limit: opts.limit ?? 100,
  };
};

export const listNodesTool: Tool = {
  name: 'colanode_list_nodes',
  description:
    'List nodes (spaces, channels, pages, databases, folders, records) in a ' +
    'workspace, optionally filtered to the children of a parent node or all ' +
    'nodes under a root. Use this to walk the tree.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string', description: 'Target workspace id' },
      parent_id: { type: 'string', description: 'List children of this node' },
      root_id: { type: 'string', description: 'List all nodes under this root' },
      limit: { type: 'number', description: 'Max results (default 100)' },
    },
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const nodes = await ctx.app.mediator.executeQuery(
      buildNodeListInput(userId, {
        parentId: args.parent_id as string | undefined,
        rootId: args.root_id as string | undefined,
        limit: args.limit as number | undefined,
      })
    );
    if (nodes.length === 0) {
      return 'No nodes found.';
    }
    return nodes
      .map((n) => {
        const name = 'name' in n ? (n.name ?? '') : '';
        return `${n.id}\t${n.type}\t${name}`;
      })
      .join('\n');
  },
};
