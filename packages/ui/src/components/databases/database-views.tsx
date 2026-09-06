import { eq, useLiveQuery } from '@tanstack/react-db';
import { useEffect, useRef } from 'react';

import { LocalDatabaseViewNode } from '@colanode/client/types';
import {
  DatabaseViewFilterAttributes,
  IdType,
  generateFractionalIndex,
  generateId,
} from '@colanode/core';
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

  // A database must always have at least one view. If the list has resolved
  // empty (e.g. a legacy database, or one whose views are still syncing) create
  // a default table view once so the surface self-heals instead of getting
  // stuck on an eternal skeleton with no way to add a view.
  const autoCreatedRef = useRef(false);
  useEffect(() => {
    if (databaseViewListQuery.isLoading || views.length > 0) {
      return;
    }
    if (!database.canEdit || database.isLocked || autoCreatedRef.current) {
      return;
    }
    autoCreatedRef.current = true;
    const viewId = generateId(IdType.DatabaseView);
    workspace.collections.nodes.insert({
      id: viewId,
      type: 'database_view',
      name: 'Default',
      index: generateFractionalIndex(null, null),
      layout: 'table',
      parentId: database.id,
      rootId: database.id,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    } as LocalDatabaseViewNode);
  }, [
    databaseViewListQuery.isLoading,
    views.length,
    database.id,
    database.canEdit,
    database.isLocked,
    workspace.userId,
  ]);

  // Only shimmer while genuinely loading -- never conflate "loading" with
  // "resolved but zero views" (that used to brick the view surface).
  if (databaseViewListQuery.isLoading) {
    return <ViewSkeleton />;
  }

  if (!activeView) {
    // Editors get the auto-created default above (this is a brief transient);
    // viewers who cannot create one get an explicit, non-blank message.
    if (database.canEdit && !database.isLocked) {
      return <ViewSkeleton />;
    }
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-sm text-muted-foreground">
        This database has no views yet.
      </div>
    );
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
