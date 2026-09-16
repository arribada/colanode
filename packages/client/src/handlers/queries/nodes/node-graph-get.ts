import { sql } from 'kysely';

import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import {
  buildGraph,
  GraphInputNode,
  GraphInputReference,
  NodeGraph,
} from '@colanode/client/lib/graph';
import { notInTrashedTreeSql } from '@colanode/client/lib/nodes';
import { NodeGraphGetQueryInput } from '@colanode/client/queries/nodes/node-graph-get';
import { Event } from '@colanode/client/types/events';
import { NodeType } from '@colanode/core';

// What the graph is allowed to draw. Channels, chats, messages and files are
// left out: they are conversation, not knowledge, and they would swamp the
// picture. Spaces stay in because they are what roots the hierarchy view.
const GRAPH_NODE_TYPES: NodeType[] = [
  'space',
  'page',
  'record',
  'database',
  'folder',
  'whiteboard',
];

export class NodeGraphGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeGraphGetQueryInput>
{
  public async handleQuery(input: NodeGraphGetQueryInput): Promise<NodeGraph> {
    const workspace = this.getWorkspace(input.userId);

    const nodeRows = await workspace.database
      .selectFrom('nodes')
      .where('type', 'in', GRAPH_NODE_TYPES)
      .where(sql<boolean>`${sql.raw(notInTrashedTreeSql('nodes'))}`)
      .select(['id', 'type', 'parent_id', 'attributes'])
      .execute();

    const referenceRows = await workspace.database
      .selectFrom('node_references')
      .where('type', '=', 'mention')
      .select(['node_id', 'reference_id'])
      .execute();

    const nodes: GraphInputNode[] = nodeRows.map((row) => {
      let name = '';
      try {
        const attributes = JSON.parse(row.attributes) as { name?: unknown };
        if (typeof attributes.name === 'string') {
          name = attributes.name;
        }
      } catch {
        // A row we cannot parse still belongs in the graph, just unnamed.
      }
      return {
        id: row.id,
        type: row.type,
        name,
        parentId: row.parent_id,
      };
    });

    const references: GraphInputReference[] = referenceRows.map((row) => ({
      nodeId: row.node_id,
      referenceId: row.reference_id,
    }));

    return buildGraph(nodes, references, {
      edgeMode: input.edgeMode,
      includeOrphans: input.includeOrphans,
      focus: input.focusNodeId
        ? { nodeId: input.focusNodeId, depth: input.depth ?? 1 }
        : undefined,
      maxNodes: input.maxNodes,
    });
  }

  public async checkForChanges(
    event: Event,
    input: NodeGraphGetQueryInput
  ): Promise<ChangeCheckResult<NodeGraphGetQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: { nodes: [], edges: [], unresolved: [] },
      };
    }

    // The graph is derived from the whole workspace, so any reference or node
    // change can alter it. Recomputing is a couple of indexed reads plus pure
    // maths; keeping a fine-grained diff here would cost more than it saves.
    if (
      (event.type === 'node.reference.created' ||
        event.type === 'node.reference.deleted' ||
        event.type === 'node.created' ||
        event.type === 'node.updated' ||
        event.type === 'node.deleted') &&
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
