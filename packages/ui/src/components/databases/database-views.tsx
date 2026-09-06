import { eq, useLiveQuery } from '@tanstack/react-db';

import { LocalDatabaseViewNode } from '@colanode/client/types';
import { DatabaseViewFilterAttributes } from '@colanode/core';
import { View } from '@colanode/ui/components/databases/view';
import { ViewSkeleton } from '@colanode/ui/components/databases/view-skeleton';
import { useDatabase } from '@colanode/ui/contexts/database';
import { DatabaseViewsContext } from '@colanode/ui/contexts/database-views';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

interface DatabaseViewsProps {
  inline?: boolean;
  extraFilters?: DatabaseViewFilterAttributes[];
}

export const DatabaseViews = ({
  inline = false,
  extraFilters,
}: DatabaseViewsProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const [activeViewId, setActiveViewId] = useMetadata<string>(
    workspace.userId,
    `${database.id}.activeViewId`
  );

  const databaseViewListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'database_view'))
        .where(({ nodes }) => eq(nodes.parentId, database.id))
        .orderBy(
          ({ nodes }) => (nodes as unknown as LocalDatabaseViewNode).index,
          'asc'
        ),
    [workspace.userId, database.id]
  );

  // While the view list is still loading, or has resolved but not yet delivered
  // any views (they stream in asynchronously during the initial workspace sync),
  // show a shaped placeholder instead of a blank pane. The live query re-renders
  // this away as soon as a view arrives, so it self-heals without a dead state.
  const views = (databaseViewListQuery.data ?? []).map(
    (node) => node as LocalDatabaseViewNode
  );
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0];

  if (databaseViewListQuery.isLoading || !activeView) {
    return <ViewSkeleton />;
  }

  return (
    <DatabaseViewsContext.Provider
      value={{
        views,
        activeViewId: activeView?.id ?? '',
        onActiveViewChange: setActiveViewId,
        inline,
        extraFilters,
      }}
    >
      {activeView && <View view={activeView} />}
    </DatabaseViewsContext.Provider>
  );
};
