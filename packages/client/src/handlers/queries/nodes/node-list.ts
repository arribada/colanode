import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { mapNode } from '@colanode/client/lib';
import {
  buildNodeFiltersQuery,
  buildNodeSortsQuery,
  notTrashedSql,
} from '@colanode/client/lib/nodes';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { NodeListQueryInput } from '@colanode/client/queries/nodes/node-list';
import { LocalNode } from '@colanode/client/types/nodes';

export class NodeListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeListQueryInput>
{
  public async handleQuery(input: NodeListQueryInput): Promise<LocalNode[]> {
    const rows = await this.fetchNodes(input);
    return rows.map(mapNode) as LocalNode[];
  }

  public async checkForChanges(): Promise<
    ChangeCheckResult<NodeListQueryInput>
  > {
    return {
      hasChanges: false,
    };
  }

  private async fetchNodes(input: NodeListQueryInput): Promise<SelectNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const filterQuery = buildNodeFiltersQuery(input.filters);
    const sortQuery = buildNodeSortsQuery(input.sorts);

    // Trashed nodes never surface through the shared nodes collection; the
    // trash view uses the dedicated node.trash.list query instead.
    let queryString = `SELECT * FROM nodes n WHERE ${notTrashedSql('n')} ${filterQuery}`;

    if (sortQuery) {
      queryString += ` ORDER BY ${sortQuery}`;
    }

    if (input.limit !== undefined && input.limit > 0) {
      queryString += ` LIMIT ${input.limit}`;
    }

    const query = sql<SelectNode>`${sql.raw(queryString)}`.compile(
      workspace.database
    );

    const result = await workspace.database.executeQuery(query);
    return result.rows;
  }
}
