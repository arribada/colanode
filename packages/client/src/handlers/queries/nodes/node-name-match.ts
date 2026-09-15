import { sql } from 'kysely';

import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { NamedNode, pickSameNameNodes } from '@colanode/client/lib/node-names';
import { notInTrashedTreeSql } from '@colanode/client/lib/nodes';
import { NodeNameMatchQueryInput } from '@colanode/client/queries/nodes/node-name-match';
import { Event } from '@colanode/client/types/events';
import { NodeType } from '@colanode/core';

const DEFAULT_TYPES: NodeType[] = ['page', 'folder', 'database', 'whiteboard'];
const DEFAULT_LIMIT = 5;

export class NodeNameMatchQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeNameMatchQueryInput>
{
  public async handleQuery(input: NodeNameMatchQueryInput): Promise<NamedNode[]> {
    const workspace = this.getWorkspace(input.userId);
    const types = input.types && input.types.length > 0 ? input.types : DEFAULT_TYPES;

    // Names are compared in JS: SQLite's lower() only folds ASCII, and a space
    // holds a few hundred nodes at most, so reading their names is cheap.
    const query = sql<NamedNode>`
      SELECT n.id AS id, n.type AS type, json_extract(n.attributes, '$.name') AS name
      FROM nodes n
      WHERE n.root_id = ${input.rootId}
        AND n.type IN (${sql.join(
          types.map((type) => sql`${type}`),
          sql`, `
        )})
        AND COALESCE(json_extract(n.attributes, '$.isTemplate'), 0) != 1
        AND ${sql.raw(notInTrashedTreeSql('n'))}
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(query);
    return pickSameNameNodes(
      input.name,
      result.rows,
      input.excludeId,
      input.limit ?? DEFAULT_LIMIT
    );
  }

  public async checkForChanges(
    event: Event,
    input: NodeNameMatchQueryInput,
    _: NamedNode[]
  ): Promise<ChangeCheckResult<NodeNameMatchQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return {
        hasChanges: true,
        result: [],
      };
    }

    return {
      hasChanges: false,
    };
  }
}
