import { runMutation, Tool } from '@colanode/agent-tools/registry';
import { generateId, IdType, RecordAttributes } from '@colanode/core';

export const buildRecordAttributes = (
  databaseId: string,
  name: string,
  fields: RecordAttributes['fields']
): RecordAttributes => ({
  type: 'record',
  parentId: databaseId,
  databaseId,
  name,
  avatar: null,
  fields,
});

export const createRecordTool: Tool = {
  name: 'colanode_create_record',
  description:
    'Create a record in a Colanode database. Pass the database id and a name; ' +
    'fields is an optional map of fieldId → field value object.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      database_id: { type: 'string' },
      name: { type: 'string' },
      fields: {
        type: 'object',
        description: 'Map of fieldId to a field value object',
      },
    },
    required: ['database_id', 'name'],
  },
  run: async (args, ctx) => {
    const userId = await ctx.resolveUserId(
      args.workspace_id as string | undefined
    );
    const nodeId = generateId(IdType.Record);
    await runMutation(ctx, {
      type: 'node.create',
      userId,
      nodeId,
      attributes: buildRecordAttributes(
        args.database_id as string,
        args.name as string,
        (args.fields as RecordAttributes['fields']) ?? {}
      ),
    });
    return `Created record ${nodeId}`;
  },
};
