import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { duplicateNodeDocument } from '@colanode/client/lib/node-document-copy';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  RecordDuplicateMutationInput,
  RecordDuplicateMutationOutput,
} from '@colanode/client/mutations/records/record-duplicate';
import { IdType, RecordAttributes, generateId } from '@colanode/core';

// "Duplicate": deep-copies a record's field values + document into a new
// record in the same database. Mirrors record.template.create, but the source
// is any record (not a template) and every field is carried over as-is; the
// copy's name gets a " (copy)" suffix. The plain node.insert the UI used before
// only ever copied the field values object it built by hand and never the
// document, so the record's body content was silently dropped on duplicate.
// Lock/version metadata and the deleted markers are intentionally not carried
// over, so the copy is an editable, live working copy owned by whoever cloned
// it.
export class RecordDuplicateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<RecordDuplicateMutationInput>
{
  async handleMutation(
    input: RecordDuplicateMutationInput
  ): Promise<RecordDuplicateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const sourceRow = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', input.recordId)
      .executeTakeFirst();

    if (!sourceRow || sourceRow.type !== 'record') {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The record to duplicate could not be found.'
      );
    }

    const sourceAttributes = JSON.parse(
      sourceRow.attributes
    ) as RecordAttributes;

    const {
      deletedAt: _deletedAt,
      deletedBy: _deletedBy,
      lockMode: _lockMode,
      lockedBy: _lockedBy,
      version: _version,
      versionLog: _versionLog,
      ...rest
    } = sourceAttributes;

    const newRecordId = generateId(IdType.Record);

    await workspace.nodes.insertNode(newRecordId, {
      ...rest,
      name: rest.name ? `${rest.name} (copy)` : '',
    });

    await duplicateNodeDocument(
      workspace,
      input.recordId,
      newRecordId,
      new Map([[input.recordId, newRecordId]])
    );

    return {
      id: newRecordId,
    };
  }
}
