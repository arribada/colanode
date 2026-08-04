// ABOUTME: Renders a small colored status dot (● red/amber/green) before an ADR
// ABOUTME: record mention, reflecting the record's live Status field value.
import { eq, useLiveQuery } from '@tanstack/react-db';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  ADR_DATABASE_ID,
  ADR_STATUS_DOT_CLASS,
  resolveAdrStatusColor,
} from '@colanode/ui/lib/adr';

// `record` is already known by the caller to be an ADR record (its databaseId
// equals ADR_DATABASE_ID), so this only resolves the DB node to map the record's
// current Status option -> color, live. Renders nothing when no color resolves.
export const AdrStatusDot = ({ record }: { record: LocalRecordNode }) => {
  const workspace = useWorkspace();

  const adrDbQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, ADR_DATABASE_ID))
        .findOne(),
    [workspace.userId]
  );

  const adrDb = (adrDbQuery.data as LocalDatabaseNode | undefined) ?? null;
  const color = resolveAdrStatusColor(record, adrDb);
  if (!color) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={`text-[0.6em] leading-none ${ADR_STATUS_DOT_CLASS[color]}`}
    >
      ●
    </span>
  );
};
