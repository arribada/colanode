import { Tool } from '@colanode/agent-tools/registry';

export const searchRecordsTool: Tool = {
  name: 'colanode_search_records',
  description:
    'Search records inside a Colanode database node by text query. Returns ' +
    'matching record ids and names.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      database_id: { type: 'string', description: 'The database node id' },
      query: { type: 'string', description: 'Search text' },
    },
    required: ['database_id', 'query'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const records = await ctx.app.mediator.executeQuery({
      type: 'record.search',
      userId,
      databaseId: args.database_id as string,
      searchQuery: args.query as string,
    });
    if (records.length === 0) {
      return 'No records found.';
    }
    return records.map((r) => `${r.id}\t${r.name ?? ''}`).join('\n');
  },
};
