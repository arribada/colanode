import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { mapNode } from '@colanode/client/lib';
import {
  buildNodeFiltersQuery,
  buildNodeSortsQuery,
  notTemplateSql,
  notTrashedSql,
} from '@colanode/client/lib/nodes';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { Event } from '@colanode/client/types/events';
import { NodeListQueryInput } from '@colanode/client/queries/nodes/node-list';
import { LocalNode } from '@colanode/client/types/nodes';

// Two node lists are equivalent when the mapped nodes serialize identically, in
// order. mapNode builds each node the same way, so this catches content edits
// (including a whiteboard's `scene`, which lives in the mapped node) reliably.
const sameNodeList = (a: LocalNode[], b: LocalNode[]): boolean =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

// Cheap, best-effort check of whether a changed node could affect this list, so
// a first sync of thousands of nodes does not re-run every open list on every
// event. Only the simple id/type filters node.list is used with are evaluated;
// anything else is treated as "might match" (re-run) so correctness is never
// traded for the optimisation.
const nodeFieldValue = (
  node: LocalNode,
  field: string[]
): string | undefined => {
  if (field.length === 1) {
    if (field[0] === 'id') {
      return node.id;
    }
    if (field[0] === 'type') {
      return node.type;
    }
  }
  return undefined;
};

const filterMightMatch = (
  node: LocalNode,
  filter: { field: string[]; operator: string; value: unknown }
): boolean => {
  const v = nodeFieldValue(node, filter.field);
  if (v === undefined) {
    return true; // not cheaply evaluable -> be safe, re-run
  }
  const { operator, value } = filter;
  if (operator === 'in') {
    return Array.isArray(value) && value.includes(v);
  }
  if (operator === 'not_in') {
    return !(Array.isArray(value) && value.includes(v));
  }
  if (operator === 'eq' || operator === '=' || operator === 'equals') {
    return v === value;
  }
  return true; // unknown operator -> re-run
};

export class NodeListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NodeListQueryInput>
{
  public async handleQuery(input: NodeListQueryInput): Promise<LocalNode[]> {
    const rows = await this.fetchNodes(input);
    return rows.map(mapNode) as LocalNode[];
  }

  public async checkForChanges(
    event: Event,
    input: NodeListQueryInput,
    output: LocalNode[]
  ): Promise<ChangeCheckResult<NodeListQueryInput>> {
    if (
      event.type === 'workspace.deleted' &&
      event.workspace.userId === input.userId
    ) {
      return { hasChanges: true, result: [] };
    }

    if (
      (event.type === 'node.created' ||
        event.type === 'node.updated' ||
        event.type === 'node.deleted') &&
      event.workspace.userId === input.userId
    ) {
      // A failure here must not escape: an exception inside a change check
      // stops every live query from updating.
      try {
        const node = event.node;
        const alreadyListed = output.some((n) => n.id === node.id);
        const mightMatch =
          input.filters.length === 0 ||
          input.filters.every((f) =>
            filterMightMatch(node, f as unknown as {
              field: string[];
              operator: string;
              value: unknown;
            })
          );
        if (!alreadyListed && !mightMatch) {
          return { hasChanges: false };
        }

        const result = await this.handleQuery(input);
        if (sameNodeList(output, result)) {
          return { hasChanges: false };
        }
        return { hasChanges: true, result };
      } catch {
        return { hasChanges: false };
      }
    }

    return { hasChanges: false };
  }

  private async fetchNodes(input: NodeListQueryInput): Promise<SelectNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const filterQuery = buildNodeFiltersQuery(input.filters);
    const sortQuery = buildNodeSortsQuery(input.sorts);

    // Trashed nodes never surface through the shared nodes collection; the
    // trash view uses the dedicated node.trash.list query instead. Template
    // records/pages are excluded the same way; record.template.list /
    // page.template.list query them explicitly for "New from template" menus.
    const templateClause = input.includeTemplates
      ? ''
      : `AND ${notTemplateSql('n')}`;
    let queryString = `SELECT * FROM nodes n WHERE ${notTrashedSql('n')} ${templateClause} ${filterQuery}`;

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
