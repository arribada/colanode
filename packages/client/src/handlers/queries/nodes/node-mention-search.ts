import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases/workspace';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { mapNode } from '@colanode/client/lib/mappers';
import { notInTrashedTreeSql } from '@colanode/client/lib/nodes';
import { NodeMentionSearchQueryInput } from '@colanode/client/queries/nodes/node-mention-search';
import { Event } from '@colanode/client/types/events';
import { LocalNode } from '@colanode/client/types/nodes';
import { NodeType } from '@colanode/core';

const DEFAULT_LIMIT = 20;

export class NodeMentionSearchQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeMentionSearchQueryInput>
{
  public async handleQuery(input: NodeMentionSearchQueryInput): Promise<LocalNode[]> {
    const rows =
      input.searchQuery.length > 0
        ? await this.searchNodes(input)
        : await this.fetchNodes(input);

    return rows.map((row) => mapNode(row));
  }

  public async checkForChanges(
    event: Event,
    input: NodeMentionSearchQueryInput,
    _: LocalNode[]
  ): Promise<ChangeCheckResult<NodeMentionSearchQueryInput>> {
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
      (event.type === 'node.created' ||
        event.type === 'node.updated' ||
        event.type === 'node.deleted') &&
      event.workspace.userId === input.userId &&
      this.isRelevantType(input, event.node.type)
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

  private isRelevantType(input: NodeMentionSearchQueryInput, type: NodeType): boolean {
    return (
      !input.types || input.types.length === 0 || input.types.includes(type)
    );
  }

  private async searchNodes(
    input: NodeMentionSearchQueryInput
  ): Promise<SelectNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const types = input.types ?? [];
    const exclude = input.exclude ?? [];
    const limit = input.limit ?? DEFAULT_LIMIT;

    // FTS5 prefix match on the node name column; the query is quoted as a
    // phrase so user input cannot break the match expression.
    const ftsQuery = `name : "${input.searchQuery.replaceAll('"', '""')}"*`;

    const query = sql<SelectNode>`
      SELECT n.*
      FROM nodes n
      JOIN node_texts ON node_texts.id = n.id
      WHERE node_texts MATCH ${ftsQuery}
        AND ${sql.raw(notInTrashedTreeSql('n'))}
        ${
          types.length > 0
            ? sql`AND n.type IN (${sql.join(
                types.map((type) => sql`${type}`),
                sql`, `
              )})`
            : sql``
        }
        ${
          exclude.length > 0
            ? sql`AND n.id NOT IN (${sql.join(
                exclude.map((id) => sql`${id}`),
                sql`, `
              )})`
            : sql``
        }
      LIMIT ${limit}
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(query);
    return result.rows;
  }

  private async fetchNodes(input: NodeMentionSearchQueryInput): Promise<SelectNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const types = input.types ?? [];
    const exclude = input.exclude ?? [];
    const limit = input.limit ?? DEFAULT_LIMIT;

    let query = workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where(sql<boolean>`${sql.raw(notInTrashedTreeSql('nodes'))}`);

    if (types.length > 0) {
      query = query.where('type', 'in', types);
    }

    if (exclude.length > 0) {
      query = query.where('id', 'not in', exclude);
    }

    return query.orderBy('created_at', 'desc').limit(limit).execute();
  }
}
