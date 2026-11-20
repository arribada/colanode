// ABOUTME: Answers the search dialog's side panel for the highlighted result, and
// ABOUTME: refreshes it when that node or its body changes.
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { buildNodeSearchPreview } from '@colanode/client/lib/node-search';
import {
  NodeSearchPreview,
  NodeSearchPreviewQueryInput,
} from '@colanode/client/queries/nodes/node-search-preview';
import { Event } from '@colanode/client/types/events';

export class NodeSearchPreviewQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeSearchPreviewQueryInput>
{
  public async handleQuery(
    input: NodeSearchPreviewQueryInput
  ): Promise<NodeSearchPreview | null> {
    const workspace = this.getWorkspace(input.userId);
    return buildNodeSearchPreview(
      workspace.database,
      input.nodeId,
      input.searchQuery
    );
  }

  public async checkForChanges(
    event: Event,
    input: NodeSearchPreviewQueryInput,
    _: NodeSearchPreview | null
  ): Promise<ChangeCheckResult<NodeSearchPreviewQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: null,
      };
    }

    const touched =
      ((event.type === 'node.updated' || event.type === 'node.deleted') &&
        event.node.id === input.nodeId) ||
      (event.type === 'document.updated' &&
        event.document.id === input.nodeId) ||
      (event.type === 'document.deleted' && event.documentId === input.nodeId);

    if (
      touched &&
      'workspace' in event &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: await this.handleQuery(input),
      };
    }

    return {
      hasChanges: false,
    };
  }
}
