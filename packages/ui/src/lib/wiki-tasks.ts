// ABOUTME: Shared resolver for the "Wiki Tasks" registry database, imported by the
// ABOUTME: home dashboard and the selection-toolbar "Task" button alike.
import { LocalDatabaseNode } from '@colanode/client/types';

// The shared "Wiki Tasks" registry database node id. Resolved by id first, then
// by name, so a recreated registry with a fresh id still works.
export const WIKI_TASKS_DB_ID = '01kypqr1dc2dw5wbydtfave3emdb';

// Resolve the Wiki Tasks database from a list of database nodes: by id first,
// then by a case-insensitive name match, then null when genuinely absent.
export const resolveWikiTasksDb = (
  databases: LocalDatabaseNode[]
): LocalDatabaseNode | null => {
  return (
    databases.find((db) => db.id === WIKI_TASKS_DB_ID) ??
    databases.find((db) =>
      (db.name ?? '').toLowerCase().includes('wiki tasks')
    ) ??
    null
  );
};
