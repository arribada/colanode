import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';

import { AutonumberFieldAttributes } from '@colanode/core';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface RecordAutonumberValueProps {
  field: AutonumberFieldAttributes;
}

// A read-only sequential index derived from the record's creation order within
// its database (record ids are time-ordered, so sorting them ascending is
// creation order). Not stored: it re-derives on the fly, so it needs no write
// hook — the trade-off is that deleting an earlier record shifts later numbers.
export const RecordAutonumberValue = ({ field }: RecordAutonumberValueProps) => {
  const workspace = useWorkspace();
  const record = useRecord();

  const query = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.parentId, record.databaseId))
        .select(({ nodes }) => ({ id: nodes.id, type: nodes.type })),
    [workspace.userId, record.databaseId]
  );

  const rank = useMemo(() => {
    const ids = (query.data ?? [])
      .filter((node) => node.type === 'record')
      .map((node) => node.id)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const index = ids.indexOf(record.id);
    return index >= 0 ? index + 1 : null;
  }, [query.data, record.id]);

  return (
    <p
      aria-label={field.name}
      className="w-full text-sm tabular-nums text-muted-foreground"
    >
      {rank ?? ''}
    </p>
  );
};
