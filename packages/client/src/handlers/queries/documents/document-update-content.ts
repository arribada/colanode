import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { DocumentUpdateContentQueryInput } from '@colanode/client/queries/documents/document-update-content';
import { Event } from '@colanode/client/types/events';
import { DocumentContent } from '@colanode/core';
import { YDoc } from '@colanode/crdt';

export class DocumentUpdateContentQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<DocumentUpdateContentQueryInput>
{
  public async handleQuery(
    input: DocumentUpdateContentQueryInput
  ): Promise<DocumentContent | null> {
    const workspace = this.getWorkspace(input.userId);

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

    // Fold the compacted base state plus every retained update in
    // chronological order, stopping right after the selected update. This
    // mirrors exactly how the document service reconstructs a document, so
    // the preview matches what a restore to this point would produce.
    const ydoc = new YDoc(documentState?.state);
    let found = false;
    for (const update of documentUpdates) {
      ydoc.applyUpdate(update.data);
      if (update.id === input.updateId) {
        found = true;
        break;
      }
    }

    if (!found) {
      // The requested update was compacted away (merged into the base state)
      // or never existed on this device; there is no fine-grained point to
      // show for it anymore.
      return null;
    }

    return ydoc.getObject<DocumentContent>();
  }

  public async checkForChanges(
    event: Event,
    input: DocumentUpdateContentQueryInput,
    _output: DocumentContent | null
  ): Promise<ChangeCheckResult<DocumentUpdateContentQueryInput>> {
    // The folded content up to a given update is immutable while that update
    // is retained. It only becomes stale if the update is compacted away or
    // the document/workspace disappears, in which case we recompute (and the
    // handler returns null so the UI clears the preview).
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: null,
      };
    }

    if (
      event.type === 'document.update.deleted' &&
      event.workspace.userId === input.userId &&
      event.documentId === input.documentId &&
      event.updateId === input.updateId
    ) {
      return {
        hasChanges: true,
        result: null,
      };
    }

    if (
      event.type === 'node.deleted' &&
      event.workspace.userId === input.userId &&
      event.node.id === input.documentId
    ) {
      return {
        hasChanges: true,
        result: null,
      };
    }

    return {
      hasChanges: false,
    };
  }
}
