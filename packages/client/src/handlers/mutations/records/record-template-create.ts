import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicateNodeDocument } from '@colanode/client/lib/node-document-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  RecordTemplateCreateMutationInput,
  RecordTemplateCreateMutationOutput,
} from '@colanode/client/mutations/records/record-template-create';
import { IdType, RecordAttributes, generateId } from '@colanode/core';

// "New from template": deep-copies a template record's field values +
// document into a brand-new normal record (isTemplate is not carried over).
// The template itself is left untouched, so it can be reused again.
export class RecordTemplateCreateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<RecordTemplateCreateMutationInput>
{
  async handleMutation(
    input: RecordTemplateCreateMutationInput
  ): Promise<RecordTemplateCreateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const sourceRow = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', input.templateId)
      .executeTakeFirst();

    if (!sourceRow || sourceRow.type !== 'record') {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The record template could not be found.'
      );
    }

    const sourceAttributes = JSON.parse(
      sourceRow.attributes
    ) as RecordAttributes;

    if (!sourceAttributes.isTemplate) {
      throw new MutationError(
        MutationErrorCode.Unknown,
        'This record is not a template.'
      );
    }

    const {
      isTemplate: _isTemplate,
      deletedAt: _deletedAt,
      deletedBy: _deletedBy,
      ...rest
    } = sourceAttributes;

    const newRecordId = generateId(IdType.Record);

    await workspace.nodes.insertNode(newRecordId, {
      ...rest,
      fields: {
        ...rest.fields,
        ...input.fieldOverrides,
      },
    });

    await duplicateNodeDocument(
      workspace,
      input.templateId,
      newRecordId,
      new Map([[input.templateId, newRecordId]])
    );

    return {
      id: newRecordId,
    };
  }
}
