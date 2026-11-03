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
import { NodeType, ProjectGraph } from '@colanode/core';

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

const EMPTY_PROJECT_GRAPH: ProjectGraph = {
  nodes: [],
  edges: [],
  unresolved: [],
  lanes: {},
  project: null,
};

// A sync burst fires hundreds of node events in a few seconds; the project
// graph is asked of the server again at most this often while they arrive.
const PROJECT_REFRESH_MS = 10_000;

export class NodeGraphGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeGraphGetQueryInput>
{
  private readonly projectFetchedAt = new Map<string, number>();
  // The last answer per graph, as JSON: an answer identical to it is not a
  // change. Without this every refresh handed the canvas a new object and
  // restarted the layout, so a graph open during a sync never came to rest.
  private readonly projectLast = new Map<string, string>();
  // Same rule for a page's own graph: a sync delivers hundreds of node events
  // that change nothing in it, and each one restarted the layout of up to 300
  // nodes. The graph never came to rest while a device was syncing.
  private readonly localLast = new Map<string, string>();

  public async handleQuery(
    input: NodeGraphGetQueryInput
  ): Promise<NodeGraph | ProjectGraph> {
    if (input.scope === 'project' && input.focusNodeId) {
      return await this.handleProjectQuery(input, input.focusNodeId);
    }

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

    const graph = buildGraph(nodes, references, {
      edgeMode: input.edgeMode,
      includeOrphans: input.includeOrphans,
      focus: input.focusNodeId
        ? { nodeId: input.focusNodeId, depth: input.depth ?? 1 }
        : undefined,
      maxNodes: input.maxNodes,
    });
    this.localLast.set(this.localKey(input), JSON.stringify(graph));
    return graph;
  }

  private localKey(input: NodeGraphGetQueryInput): string {
    return JSON.stringify([
      input.userId,
      input.focusNodeId ?? null,
      input.edgeMode,
      input.includeOrphans,
      input.depth ?? null,
      input.maxNodes ?? null,
    ]);
  }

  // A template project, in lanes, built by the server. Not from this
  // device's store: a device holds the pages it has opened and the databases
  // it has synced, which on a fresh browser was MARLIN's 15 pages and none of
  // its 95 requirements -- the graph would have reported a project with no
  // requirements as a fact.
  private async handleProjectQuery(
    input: NodeGraphGetQueryInput,
    focusNodeId: string
  ): Promise<ProjectGraph> {
    const workspace = this.getWorkspace(input.userId);
    this.projectFetchedAt.set(this.projectKey(input), Date.now());
    try {
      const graph = await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/projects/graph`, {
          searchParams: { pageId: focusNodeId },
          timeout: 60_000,
        })
        .json<ProjectGraph>();
      this.projectLast.set(this.projectKey(input), JSON.stringify(graph));
      return graph;
    } catch {
      // Offline, or the server does not have the template: nothing to draw,
      // and the view says so rather than drawing a partial project.
      return EMPTY_PROJECT_GRAPH;
    }
  }

  private projectKey(input: NodeGraphGetQueryInput): string {
    return `${input.userId}|${input.focusNodeId ?? ''}`;
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

    const affectsGraph =
      (event.type === 'node.reference.created' ||
        event.type === 'node.reference.deleted' ||
        event.type === 'node.created' ||
        event.type === 'node.updated' ||
        event.type === 'node.deleted') &&
      event.workspace.userId === input.userId;

    if (input.scope === 'project') {
      // The server holds the answer, so it is asked again when something
      // changed here, but not on every event of a burst.
      const key = this.projectKey(input);
      const last = this.projectFetchedAt.get(key) ?? 0;
      if (affectsGraph && Date.now() - last >= PROJECT_REFRESH_MS) {
        const before = this.projectLast.get(key);
        const result = await this.handleQuery(input);
        if (before !== undefined && this.projectLast.get(key) === before) {
          return { hasChanges: false };
        }
        return { hasChanges: true, result };
      }
      return { hasChanges: false };
    }

    // The graph is derived from the whole workspace, so any reference or node
    // change can alter it. Recomputing is a couple of indexed reads plus pure
    // maths; keeping a fine-grained diff here would cost more than it saves.
    if (affectsGraph) {
      const key = this.localKey(input);
      const before = this.localLast.get(key);
      const result = await this.handleQuery(input);
      if (before !== undefined && this.localLast.get(key) === before) {
        return { hasChanges: false };
      }
      return { hasChanges: true, result };
    }

    return {
      hasChanges: false,
    };
  }
}
