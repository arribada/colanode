import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { mapNode } from '@colanode/client/lib';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib/types';
import { PageTemplateListQueryInput } from '@colanode/client/queries/pages/page-template-list';
import { Event } from '@colanode/client/types/events';
import { LocalPageNode } from '@colanode/client/types/nodes';

// Lists page templates saved directly under a space (isTemplate attribute
// set, parentId is the space), by name. Regular page listings (space
// sidebar tree) exclude these via notTemplateSql; this is the dedicated
// bypass used by the space's "New from template" menu, mirroring
// node.trash.list's role for trashed nodes.
export class PageTemplateListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<PageTemplateListQueryInput>
{
  public async handleQuery(
    input: PageTemplateListQueryInput
  ): Promise<LocalPageNode[]> {
    return this.fetchTemplates(input);
  }

  public async checkForChanges(
    event: Event,
    input: PageTemplateListQueryInput,
    _: LocalPageNode[]
  ): Promise<ChangeCheckResult<PageTemplateListQueryInput>> {
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
      event.node.type === 'page'
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
    input: PageTemplateListQueryInput
  ): Promise<LocalPageNode[]> {
    const workspace = this.getWorkspace(input.userId);

    const query = sql<SelectNode>`
      SELECT n.*
      FROM nodes n
      WHERE n.parent_id = ${input.spaceId}
        AND n.type = 'page'
        AND json_extract(n.attributes, '$.isTemplate') = 1
      ORDER BY json_extract(n.attributes, '$.name') ASC
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(query);
    return result.rows.map(mapNode) as LocalPageNode[];
  }
}
