import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { mapNode } from '@colanode/client/lib';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { NodeTrashListQueryInput } from '@colanode/client/queries/nodes/node-trash-list';
import { Event } from '@colanode/client/types/events';
import { LocalNode } from '@colanode/client/types/nodes';

const DEFAULT_LIMIT = 500;

// Lists nodes that were soft-deleted (deletedAt attribute set), newest first.
// Descendants of a trashed node are NOT listed unless they were trashed on
// their own: they are hidden with their ancestor and restored with it.
export class NodeTrashListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeTrashListQueryInput>
{
  public async handleQuery(input: NodeTrashListQueryInput): Promise<LocalNode[]> {
    return this.fetchTrashedNodes(input);
  }

  public async checkForChanges(
    event: Event,
    input: NodeTrashListQueryInput,
    _: LocalNode[]
  ): Promise<ChangeCheckResult<NodeTrashListQueryInput>> {
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
      (event.type === 'node.updated' || event.type === 'node.deleted') &&
      event.workspace.userId === input.userId
    ) {
      const newResult = await this.fetchTrashedNodes(input);
      return {
        hasChanges: true,
        result: newResult,
      };
    }

    return {
      hasChanges: false,
    };
  }

  private async fetchTrashedNodes(
    input: NodeTrashListQueryInput
  ): Promise<LocalNode[]> {
    const workspace = this.getWorkspace(input.userId);
    const limit = input.limit ?? DEFAULT_LIMIT;

    const query = sql<SelectNode>`
      SELECT n.*
      FROM nodes n
      WHERE json_extract(n.attributes, '$.deletedAt') IS NOT NULL
      ORDER BY json_extract(n.attributes, '$.deletedAt') DESC
      LIMIT ${limit}
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(query);
    return result.rows.map(mapNode);
  }
}
