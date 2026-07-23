import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases/workspace';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import {
  buildFtsMatchQuery,
  buildSnippet,
  tokenizeSearchQuery,
} from '@colanode/client/lib/fts';
import {
  NodeSearchMatchSource,
  NodeSearchQueryInput,
  NodeSearchResult,
} from '@colanode/client/queries/nodes/node-search';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import { Event } from '@colanode/client/types/events';
import {
  DocumentContent,
  NodeAttributes,
  extractDocumentText,
  getNodeModel,
} from '@colanode/core';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export class NodeSearchQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeSearchQueryInput>
{
  public async handleQuery(
    input: NodeSearchQueryInput
  ): Promise<NodeSearchResult[]> {
    return this.search(input);
  }

  public async checkForChanges(
    event: Event,
    input: NodeSearchQueryInput,
    _: NodeSearchResult[]
  ): Promise<ChangeCheckResult<NodeSearchQueryInput>> {
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
        event.type === 'node.deleted' ||
        event.type === 'document.updated' ||
        event.type === 'document.deleted') &&
      event.workspace.userId === input.userId
    ) {
      const newResult = await this.search(input);
      return {
        hasChanges: true,
        result: newResult,
      };
    }

    return {
      hasChanges: false,
    };
  }

  private async search(
    input: NodeSearchQueryInput
  ): Promise<NodeSearchResult[]> {
    const tokens = tokenizeSearchQuery(input.searchQuery);
    const matchQuery = buildFtsMatchQuery(tokens);
    if (!matchQuery) {
      return [];
    }

    const workspace = this.getWorkspace(input.userId);
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    // Nodes whose name (or indexed attributes, e.g. message text and record
    // field values) match rank above nodes matched only by document content.
    const nameRows = await this.matchFts(
      workspace,
      'node_texts',
      matchQuery,
      limit
    );
    const contentRows = await this.matchFts(
      workspace,
      'document_texts',
      matchQuery,
      limit
    );

    const nameIds = new Set(nameRows.map((row) => row.id));
    const contentIds = new Set(contentRows.map((row) => row.id));

    const rows: SelectNode[] = [...nameRows];
    for (const row of contentRows) {
      if (rows.length >= limit) {
        break;
      }

      if (!nameIds.has(row.id)) {
        rows.push(row);
      }
    }

    const documentTexts = await this.fetchDocumentTexts(
      workspace,
      rows.filter((row) => contentIds.has(row.id)).map((row) => row.id)
    );
    const rootNames = await this.fetchRootNames(
      workspace,
      rows.map((row) => row.root_id)
    );

    const results: NodeSearchResult[] = [];
    for (const row of rows) {
      const attributes = JSON.parse(row.attributes) as NodeAttributes;
      const matchedIn: NodeSearchMatchSource = nameIds.has(row.id)
        ? 'name'
        : 'content';

      let snippet: string | null = null;
      if (contentIds.has(row.id)) {
        snippet = buildSnippet(documentTexts.get(row.id), tokens);
      }

      if (!snippet) {
        const nodeText = getNodeModel(attributes.type).extractText(
          row.id,
          attributes
        );
        snippet = buildSnippet(nodeText?.attributes, tokens);
      }

      results.push({
        id: row.id,
        type: row.type,
        name: 'name' in attributes ? (attributes.name ?? null) : null,
        avatar: 'avatar' in attributes ? (attributes.avatar ?? null) : null,
        rootId: row.root_id,
        spaceName: rootNames.get(row.root_id) ?? null,
        snippet,
        matchedIn,
      });
    }

    return results;
  }

  private async matchFts(
    workspace: WorkspaceService,
    table: 'node_texts' | 'document_texts',
    matchQuery: string,
    limit: number
  ): Promise<SelectNode[]> {
    const query = sql<SelectNode>`
      SELECT n.*
      FROM (
        SELECT id, rank
        FROM ${sql.raw(table)}
        WHERE ${sql.raw(table)} MATCH ${matchQuery}
        ORDER BY rank
        LIMIT ${limit}
      ) m
      JOIN nodes n ON n.id = m.id
      ORDER BY m.rank
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(query);
    return result.rows;
  }

  private async fetchDocumentTexts(
    workspace: WorkspaceService,
    documentIds: string[]
  ): Promise<Map<string, string | null>> {
    const texts = new Map<string, string | null>();
    if (documentIds.length === 0) {
      return texts;
    }

    const rows = await workspace.database
      .selectFrom('documents')
      .select(['id', 'content'])
      .where('id', 'in', documentIds)
      .execute();

    for (const row of rows) {
      const content = JSON.parse(row.content) as DocumentContent;
      texts.set(row.id, extractDocumentText(row.id, content));
    }

    return texts;
  }

  private async fetchRootNames(
    workspace: WorkspaceService,
    rootIds: string[]
  ): Promise<Map<string, string | null>> {
    const names = new Map<string, string | null>();
    const uniqueRootIds = [...new Set(rootIds)];
    if (uniqueRootIds.length === 0) {
      return names;
    }

    const rows = await workspace.database
      .selectFrom('nodes')
      .select(['id', 'attributes'])
      .where('id', 'in', uniqueRootIds)
      .execute();

    for (const row of rows) {
      const attributes = JSON.parse(row.attributes) as NodeAttributes;
      names.set(
        row.id,
        'name' in attributes ? (attributes.name ?? null) : null
      );
    }

    return names;
  }
}
