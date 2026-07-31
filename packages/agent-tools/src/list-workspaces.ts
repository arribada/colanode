import { Tool } from '@colanode/agent-tools/registry';

export const listWorkspacesTool: Tool = {
  name: 'colanode_list_workspaces',
  description:
    'List the Colanode workspaces this server is logged into. Returns each ' +
    "workspace's id and name; pass the id as workspace_id to other tools.",
  inputSchema: { type: 'object', properties: {} },
  run: async (_args, ctx) => {
    const workspaces = await ctx.app.mediator.executeQuery({
      type: 'workspace.list',
    });
    if (workspaces.length === 0) {
      return 'No workspaces available.';
    }
    return workspaces.map((w) => `${w.workspaceId}\t${w.name}`).join('\n');
  },
};
