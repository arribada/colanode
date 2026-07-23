import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases/workspace';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import {
  buildFtsMatchQuery,
  tokenizeSearchQuery,
} from '@colanode/client/lib/fts';
import { mapNode } from '@colanode/client/lib/mappers';
import { notInTrashedTreeSql } from '@colanode/client/lib/nodes';
import { RecordSearchQueryInput } from '@colanode/client/queries/records/record-search';
import { Event } from '@colanode/client/types/events';
import { LocalRecordNode } from '@colanode/client/types/nodes';

export class RecordSearchQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<RecordSearchQueryInput>
{
  public async handleQuery(
    input: RecordSearchQueryInput
  ): Promise<LocalRecordNode[]> {
    const rows =
      input.searchQuery.length > 0
        ? await this.searchRecords(input)
        : await this.fetchRecords(input);

    return rows.map((row) => mapNode(row) as LocalRecordNode);
  }

  public async checkForChanges(
    event: Event,
    input: RecordSearchQueryInput,
    _: LocalRecordNode[]
  ): Promise<ChangeCheckResult<RecordSearchQueryInput>> {
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
      event.type === 'node.created' &&
      event.workspace.userId === input.userId &&
      event.node.type === 'record' &&
      event.node.databaseId === input.databaseId
    ) {
      const newResult = await this.handleQuery(input);
      return {
        hasChanges: true,
        result: newResult,
      };
    }

    if (
      event.type === 'node.updated' &&
      event.workspace.userId === input.userId &&
      event.node.type === 'record' &&
      event.node.databaseId === input.databaseId
    ) {
      const newResult = await this.handleQuery(input);
      return {
        hasChanges: true,
        result: newResult,
      };
    }

    if (
      event.type === 'node.deleted' &&
      event.workspace.userId === input.userId &&
      event.node.type === 'record' &&
      event.node.databaseId === input.databaseId
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

  private async searchRecords(
    input: RecordSearchQueryInput
  ): Promise<SelectNode[]> {
    const matchQuery = buildFtsMatchQuery(
      tokenizeSearchQuery(input.searchQuery),
      'name'
    );

    if (!matchQuery) {
      return this.fetchRecords(input);
    }

    const workspace = this.getWorkspace(input.userId);

    const exclude = input.exclude ?? [];
    const query = sql<SelectNode>`
      SELECT n.*
      FROM (SELECT id FROM node_texts WHERE node_texts MATCH ${matchQuery}) m
      JOIN nodes n ON n.id = m.id
      WHERE n.type = 'record'
        AND n.parent_id = ${input.databaseId}
        AND ${sql.raw(notInTrashedTreeSql('n'))}
        ${
          exclude.length > 0
            ? sql`AND n.id NOT IN (${sql.join(
                exclude.map((id) => sql`${id}`),
                sql`, `
              )})`
            : sql``
        }
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(query);
    return result.rows;
  }

  private async fetchRecords(
    input: RecordSearchQueryInput
  ): Promise<SelectNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const exclude = input.exclude ?? [];
    return workspace.database
      .selectFrom('nodes')
      .where('type', '=', 'record')
      .where('parent_id', '=', input.databaseId)
      .where('id', 'not in', exclude)
      .where(sql<boolean>`${sql.raw(notInTrashedTreeSql('nodes'))}`)
      .selectAll()
      .execute();
  }
}
