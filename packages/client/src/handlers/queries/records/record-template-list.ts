import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { mapNode } from '@colanode/client/lib';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { RecordTemplateListQueryInput } from '@colanode/client/queries/records/record-template-list';
import { Event } from '@colanode/client/types/events';
import { LocalRecordNode } from '@colanode/client/types/nodes';

// Lists template records of a database (isTemplate attribute set), by name.
// Regular record listings (table/board/calendar views) exclude these via
// notTemplateSql; this is the dedicated bypass used by "New from template"
// menus, mirroring node.trash.list's role for trashed nodes.
export class RecordTemplateListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<RecordTemplateListQueryInput>
{
  public async handleQuery(
    input: RecordTemplateListQueryInput
  ): Promise<LocalRecordNode[]> {
    return this.fetchTemplates(input);
  }

  public async checkForChanges(
    event: Event,
    input: RecordTemplateListQueryInput,
    _: LocalRecordNode[]
  ): Promise<ChangeCheckResult<RecordTemplateListQueryInput>> {
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
      event.node.type === 'record'
    ) {
      const newResult = await this.fetchTemplates(input);
      return {
        hasChanges: true,
        result: newResult,
      };
    }

    return {
      hasChanges: false,
    };
  }

  private async fetchTemplates(
    input: RecordTemplateListQueryInput
  ): Promise<LocalRecordNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const query = sql<SelectNode>`
      SELECT n.*
      FROM nodes n
      WHERE json_extract(n.attributes, '$.databaseId') = ${input.databaseId}
        AND n.type = 'record'
        AND json_extract(n.attributes, '$.isTemplate') = 1
      ORDER BY json_extract(n.attributes, '$.name') ASC
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(query);
    return result.rows.map(mapNode) as LocalRecordNode[];
  }
}
