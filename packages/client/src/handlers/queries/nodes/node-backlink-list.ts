import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { mapNode } from '@colanode/client/lib/mappers';
import { NodeBacklinkListQueryInput } from '@colanode/client/queries/nodes/node-backlink-list';
import { Event } from '@colanode/client/types/events';
import { LocalNode } from '@colanode/client/types/nodes';
import { NodeType } from '@colanode/core';

// Node types whose rich-text documents can mention other nodes. Messages
// also produce mention references but are not listed as backlinks (v1).
const BACKLINK_SOURCE_TYPES: NodeType[] = ['page', 'record'];

export class NodeBacklinkListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeBacklinkListQueryInput>
{
  public async handleQuery(
    input: NodeBacklinkListQueryInput
  ): Promise<LocalNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const rows = await workspace.database
      .selectFrom('nodes')
      .innerJoin('node_references', 'node_references.node_id', 'nodes.id')
      .where('node_references.reference_id', '=', input.nodeId)
      .where('node_references.type', '=', 'mention')
      .where('nodes.type', 'in', BACKLINK_SOURCE_TYPES)
      .selectAll('nodes')
      .distinct()
      .orderBy('nodes.created_at', 'desc')
      .execute();

    return rows.map((row) => mapNode(row));
  }

  public async checkForChanges(
    event: Event,
    input: NodeBacklinkListQueryInput,
    output: LocalNode[]
  ): Promise<ChangeCheckResult<NodeBacklinkListQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: [],
      };
    }

    if (
      (event.type === 'node.reference.created' ||
        event.type === 'node.reference.deleted') &&
      event.workspace.userId === input.userId &&
      event.nodeReference.referenceId === input.nodeId
    ) {
      const newResult = await this.handleQuery(input);
      return {
        hasChanges: true,
        result: newResult,
      };
    }

    if (
      (event.type === 'node.updated' || event.type === 'node.deleted') &&
      event.workspace.userId === input.userId &&
      output.some((node) => node.id === event.node.id)
    ) {
      const newResult = await this.handleQuery(input);
      return {
        hasChanges: true,
        result: newResult,
      };
    }

    return {
      hasChanges: false,
    };
  }
}
