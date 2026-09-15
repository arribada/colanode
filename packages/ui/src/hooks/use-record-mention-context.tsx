import { eq, useLiveQuery } from '@tanstack/react-db';

import { LocalNode, LocalRecordNode } from '@colanode/client/types';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  RecordMentionContext,
  getRecordMentionContext,
} from '@colanode/ui/lib/record-mention';

/**
 * The project and short id of a record, read from its database. Databases are
 * preloaded into the nodes collection, so this costs no round trip.
 */
export const useRecordMentionContext = (
  record: LocalRecordNode
): RecordMentionContext => {
  const workspace = useWorkspace();

  const databaseQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, record.databaseId))
        .findOne(),
    [workspace.userId, record.databaseId]
  );

  const databaseNode = databaseQuery.data as LocalNode | undefined;
  const database = databaseNode?.type === 'database' ? databaseNode : null;
  return getRecordMentionContext(record, database);
};
