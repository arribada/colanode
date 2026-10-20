// ABOUTME: Runs a view's search box over every record of the database and returns
// ABOUTME: the ids that match, or null while the box is empty.
import { useMemo, useRef } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
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
  // loaded rows would miss the rest. Match against the whole database, read
  // straight from the local store: the shared nodes collection only holds what
  // some view asked for, and a query on it for every record never finished
  // loading -- it stayed at the rows already on screen. Only while something
  // is typed: an empty box costs nothing.
  const recordsQuery = useLiveQuery(
    {
      type: 'node.list',
      userId: workspace.userId,
      filters: [
        { field: ['type'], operator: 'eq', value: 'record' },
        { field: ['databaseId'], operator: 'eq', value: database.id },
      ],
      sorts: [],
    },
    { enabled: active }
  );

  const usersQuery = useLiveQuery(
    { type: 'user.list', userId: workspace.userId },
    { enabled: active }
  );

  // undefined: the records are still loading. The view keeps what it shows
  // rather than flashing empty, as if nothing matched.
  const ids = useMemo((): string[] | null | undefined => {
    if (!active) {
      return null;
    }
    if (recordsQuery.data === undefined) {
      return undefined;
    }

    const userNames = new Map<string, string>();
    for (const user of usersQuery.data ?? []) {
      userNames.set(user.id, user.customName || user.name);
    }

    const records = recordsQuery.data.filter(
      (node): node is LocalRecordNode =>
        node.type === 'record' && node.isTemplate !== true
    );
    const recordNames = new Map(
      records.map((record) => [record.id, record.name])
    );

    const matched = matchRecordIds(records, database.fields, query, {
      userName: (userId) => userNames.get(userId),
      // A relation may point into another database; those names come from the
      // shared collection, which holds whatever has been opened.
      recordName: (recordId) => {
        const local = recordNames.get(recordId);
        if (local !== undefined) {
          return local;
        }
        const node = workspace.collections.nodes.get(recordId);
        return node?.type === 'record' ? node.name : undefined;
      },
    });
    // The store promises no order; sorting lets sameIds below see an
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
  if (ids !== undefined && !sameIds(stable.current, ids)) {
    stable.current = ids;
  }
  return stable.current;
};
