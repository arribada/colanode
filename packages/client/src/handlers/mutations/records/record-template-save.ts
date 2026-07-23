import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicateNodeDocument } from '@colanode/client/lib/node-document-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  RecordTemplateSaveMutationInput,
  RecordTemplateSaveMutationOutput,
} from '@colanode/client/mutations/records/record-template-save';
import { IdType, RecordAttributes, generateId } from '@colanode/core';

// "Save as template": deep-copies the record's field values + document into
// a brand-new record marked isTemplate, in the same database. The source
// record is left untouched — this is a copy, not a conversion.
export class RecordTemplateSaveMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<RecordTemplateSaveMutationInput>
{
  async handleMutation(
    input: RecordTemplateSaveMutationInput
  ): Promise<RecordTemplateSaveMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const sourceRow = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', input.recordId)
      .executeTakeFirst();

    if (!sourceRow || sourceRow.type !== 'record') {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The record to save as a template could not be found.'
      );
    }

    const sourceAttributes = JSON.parse(
      sourceRow.attributes
    ) as RecordAttributes;

    if (sourceAttributes.isTemplate) {
      throw new MutationError(
        MutationErrorCode.Unknown,
        'This record is already a template.'
      );
    }

    const newTemplateId = generateId(IdType.Record);

    await workspace.nodes.insertNode(newTemplateId, {
      ...sourceAttributes,
      isTemplate: true,
    });

    await duplicateNodeDocument(
      workspace,
      input.recordId,
      newTemplateId,
      new Map([[input.recordId, newTemplateId]])
    );

    return {
      id: newTemplateId,
    };
  }
}
