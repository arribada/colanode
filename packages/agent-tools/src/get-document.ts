import { Tool } from '@colanode/agent-tools/registry';

export const getDocumentTool: Tool = {
  name: 'colanode_get_document',
  description:
    'Get the document content of a page (or any node that has a document) by ' +
    'its node id.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      document_id: { type: 'string', description: 'The node/document id' },
    },
    required: ['document_id'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const document = await ctx.app.mediator.executeQuery({
      type: 'document.get',
      documentId: args.document_id as string,
      userId,
    });
    if (!document) {
      return 'Document not found.';
    }
    return JSON.stringify(document.content, null, 2);
  },
};
