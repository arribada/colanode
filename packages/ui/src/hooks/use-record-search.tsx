// ABOUTME: Runs a view's search box over every record of the database and returns
// ABOUTME: the ids that match, or null while the box is empty.
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo, useRef } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  matchRecordIds,
  parseSearchWords,
  sameIds,
} from '@colanode/ui/lib/record-search';

export const useRecordSearch = (query: string): string[] | null => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const active = parseSearchWords(query).length > 0;

  // The views page their records 100 at a time, so a search applied to the
  // loaded rows would miss the rest. Match against the whole database instead,
  // and only while something is typed: an empty box costs nothing.
  const recordsQuery = useLiveQuery(
    (q) =>
      active
        ? q
            .from({ nodes: workspace.collections.nodes })
            .where(({ nodes }) => eq(nodes.type, 'record'))
            .where(({ nodes }) =>
              eq((nodes as unknown as LocalRecordNode).databaseId, database.id)
            )
        : undefined,
    [active, database.id]
  );

  const usersQuery = useLiveQuery(
    (q) =>
      active ? q.from({ users: workspace.collections.users }) : undefined,
    [active]
  );

  const ids = useMemo(() => {
    if (!active) {
      return null;
    }

    const userNames = new Map<string, string>();
    for (const user of usersQuery.data ?? []) {
      userNames.set(user.id, user.customName || user.name);
    }

    const records = ((recordsQuery.data ?? []) as LocalRecordNode[]).filter(
      (record) => record.isTemplate !== true
    );

    const matched = matchRecordIds(records, database.fields, query, {
      userName: (userId) => userNames.get(userId),
      recordName: (recordId) => {
        const node = workspace.collections.nodes.get(recordId);
        return node?.type === 'record' ? node.name : undefined;
      },
    });
    // The live query promises no order; sorting lets sameIds below see an
    // unchanged match as unchanged.
    return matched ? matched.sort() : null;
  }, [
    active,
    query,
    recordsQuery.data,
    usersQuery.data,
    database.fields,
    workspace,
  ]);

  // Every edit to any record of the database recomputes the matches. Keep the
  // previous list while the matching ids are unchanged, so the views' own live
  // queries are not torn down and rebuilt on each keystroke in a cell.
  const stable = useRef<string[] | null>(null);
  if (!sameIds(stable.current, ids)) {
    stable.current = ids;
  }
  return stable.current;
};
