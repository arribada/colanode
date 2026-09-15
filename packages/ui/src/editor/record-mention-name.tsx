// ABOUTME: The text of an inline record mention: "<project> · <key>" when the record
// ABOUTME: has them (full name in the tooltip), otherwise the record name as before.
import { eq, useLiveQuery } from '@tanstack/react-db';

import { LocalNode, LocalRecordNode } from '@colanode/client/types';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  formatRecordMentionChip,
  formatRecordMentionLabel,
  getRecordMentionContext,
} from '@colanode/ui/lib/record-mention';

export const RecordMentionName = ({
  record,
  name,
}: {
  record: LocalRecordNode;
  name: string;
}) => {
  const workspace = useWorkspace();

  // Databases are preloaded into the nodes collection, so this resolves the
  // record's database (for its select option names) without a round trip.
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
  const ctx = getRecordMentionContext(record, database);
  const chip = formatRecordMentionChip(ctx);

  if (!chip) {
    return <span role="presentation">{name}</span>;
  }

  return (
    <span role="presentation" title={formatRecordMentionLabel(name, ctx)}>
      {chip}
    </span>
  );
};
