import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import { fetchNodeTree } from '@colanode/client/lib/utils';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  DocumentRestoreMutationInput,
  DocumentRestoreMutationOutput,
} from '@colanode/client/mutations/documents/document-restore';
import { getNodeModel } from '@colanode/core';
import { YDoc } from '@colanode/crdt';

export class DocumentRestoreMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<DocumentRestoreMutationInput>
{
  async handleMutation(
    input: DocumentRestoreMutationInput
  ): Promise<DocumentRestoreMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const tree = await fetchNodeTree(workspace.database, input.documentId);
    const node = tree[tree.length - 1];
    if (!node || node.id !== input.documentId) {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'Document not found.'
      );
    }

    const model = getNodeModel(node.type);
    if (!model.documentSchema) {
      throw new MutationError(
        MutationErrorCode.DocumentRestoreFailed,
        'This node does not have a document.'
      );
    }

    if (!model.documentSchema.safeParse(input.content).success) {
      throw new MutationError(
        MutationErrorCode.DocumentRestoreFailed,
        'The version content is invalid.'
      );
    }

    // Rebuild the current CRDT state and generate a NEW update that
    // transforms it into the snapshot content. History is never rewritten:
    // the restore is just another document update on top of the existing
    // state, so it is safe with concurrent editors.
    const documentState = await workspace.database
      .selectFrom('document_states')
      .selectAll()
      .where('id', '=', input.documentId)
      .executeTakeFirst();

    const documentUpdates = await workspace.database
      .selectFrom('document_updates')
      .selectAll()
      .where('document_id', '=', input.documentId)
      .orderBy('id', 'asc')
      .execute();

    const ydoc = new YDoc(documentState?.state);
    for (const update of documentUpdates) {
      ydoc.applyUpdate(update.data);
    }

    const update = ydoc.update(model.documentSchema, input.content);
    if (!update) {
      // Content is already identical to the snapshot — nothing to do.
      return {
        success: true,
      };
    }

    await workspace.documents.updateDocument(input.documentId, update);

    return {
      success: true,
    };
  }
}
