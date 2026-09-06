import { eq, useLiveQuery } from '@tanstack/react-db';

import { LocalDatabaseNode } from '@colanode/client/types';
import { NodeRole } from '@colanode/core';
import { Database } from '@colanode/ui/components/databases/database';
import { NodeContainerSkeleton } from '@colanode/ui/components/nodes/node-container-skeleton';
import { NodeUnavailable } from '@colanode/ui/components/nodes/node-unavailable';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface RecordDatabaseProps {
  id: string;
  role: NodeRole;
  children: React.ReactNode;
}

export const RecordDatabase = ({ id, role, children }: RecordDatabaseProps) => {
  const workspace = useWorkspace();

  const databaseGetQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, id))
        .findOne(),
    [workspace.userId, id]
  );

  if (databaseGetQuery.isLoading) {
    return <NodeContainerSkeleton />;
  }

  // The parent database can be transiently absent while a large workspace is
  // still syncing (the record node arrived before its database). Show the
  // self-healing "syncing" state instead of a blank body; the live query
  // re-renders this away once the database node is delivered.
  if (!databaseGetQuery.data || databaseGetQuery.data.type !== 'database') {
    return <NodeUnavailable />;
  }

  const database = databaseGetQuery.data as LocalDatabaseNode;
  return (
    <Database database={database} role={role}>
      {children}
    </Database>
  );
};
