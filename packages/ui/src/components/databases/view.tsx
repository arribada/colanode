import { useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { match } from 'ts-pattern';

import {
  LocalDatabaseViewNode,
  LocalRecordNode,
  ViewField,
} from '@colanode/client/types';
import {
  compareString,
  SortDirection,
  DatabaseViewFilterAttributes,
  DatabaseViewSortAttributes,
  SpecialId,
  generateId,
  IdType,
} from '@colanode/core';
import { ViewSkeleton } from '@colanode/ui/components/databases/view-skeleton';
import { useDatabase } from '@colanode/ui/contexts/database';
import { DatabaseViewContext } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useViewScope } from '@colanode/ui/hooks/use-view-scope';
import {
  generateFieldValuesFromFilters,
  getDefaultFieldWidth,
  getDefaultNameWidth,
  getDefaultViewFieldDisplay,
} from '@colanode/ui/lib/databases';

// Each of the 5 view layouts is dynamic-imported so a database that only
// ever gets opened as a table doesn't also pay for the board/calendar/
// gallery/list renderers up front. Suspense (below) falls back to a shared
// shimmer skeleton the first time a given layout is opened in a session --
// after that the chunk is cached and switching views is instant.
const TableView = lazy(() =>
  import('@colanode/ui/components/databases/tables/table-view').then(
    (module) => ({ default: module.TableView })
  )
);
const BoardView = lazy(() =>
  import('@colanode/ui/components/databases/boards/board-view').then(
    (module) => ({ default: module.BoardView })
  )
);
const CalendarView = lazy(() =>
  import('@colanode/ui/components/databases/calendars/calendar-view').then(
    (module) => ({ default: module.CalendarView })
  )
);
const GalleryView = lazy(() =>
  import('@colanode/ui/components/databases/galleries/gallery-view').then(
    (module) => ({ default: module.GalleryView })
  )
);
const ListView = lazy(() =>
  import('@colanode/ui/components/databases/lists/list-view').then(
    (module) => ({ default: module.ListView })
  )
);
const ChartView = lazy(() =>
  import('@colanode/ui/components/databases/charts/chart-view').then(
    (module) => ({ default: module.ChartView })
  )
);

interface ViewProps {
  view: LocalDatabaseViewNode;
}

export const View = ({ view }: ViewProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const navigate = useNavigate();
  const { mutate: createFromTemplate } = useMutation();
  const scope = useViewScope(view.id);
  const effectiveFilters =
    scope.mode === 'personal'
      ? Object.values(scope.state.filters ?? {})
      : Object.values(view.filters ?? {});
  const effectiveSorts =
    scope.mode === 'personal'
      ? Object.values(scope.state.sorts ?? {})
      : Object.values(view.sorts ?? {});

  const fields: ViewField[] = database.fields
    .map((field) => {
      const viewField = view.fields?.[field.id];

      return {
        field,
        display: viewField?.display ?? getDefaultViewFieldDisplay(view.layout),
        index: viewField?.index ?? field.index,
        width: viewField?.width ?? getDefaultFieldWidth(field.type),
      };
    })
    .filter((field) => field.display)
    .sort((a, b) => compareString(a.index, b.index));

  const [isSearchBarOpened, setIsSearchBarOpened] = useState(false);
  const [isSortsOpened, setIsSortsOpened] = useState(false);
  const [openedFieldFilters, setOpenedFieldFilters] = useState<string[]>([]);

  return (
    <DatabaseViewContext.Provider
      value={{
        id: view.id,
        name: view.name,
        avatar: view.avatar,
        layout: view.layout,
        fields,
        filters: effectiveFilters,
        sorts: effectiveSorts,
        scopeMode: scope.mode,
        setScopeMode: scope.setMode,
        clearPersonal: scope.clearPersonal,
        groupBy: view.groupBy,
        chart: view.chart,
        conditionalColors: view.conditionalColors ?? [],
        zebra: view.zebra ?? false,
        nameWidth: view.nameWidth ?? getDefaultNameWidth(),
        isSearchBarOpened: isSearchBarOpened || openedFieldFilters.length > 0,
        isSortsOpened,
        isFieldFilterOpened: (fieldId: string) =>
          openedFieldFilters.includes(fieldId),
        initFieldFilter: (fieldId: string) => {
          if (scope.mode === 'personal') {
            const existing = scope.state.filters?.[fieldId];
            if (existing) {
              setOpenedFieldFilters((prev) =>
                prev.filter((id) => id !== fieldId)
              );
              return;
            }
            if (
              fieldId !== SpecialId.Name &&
              !database.fields.find((f) => f.id === fieldId)
            ) {
              return;
            }
            scope.setFilter(fieldId, {
              id: fieldId,
              fieldId,
              type: 'field',
              operator: 'equals',
              value: '',
            });
            setOpenedFieldFilters((prev) => [...prev, fieldId]);
            return;
          }

          workspace.collections.nodes.update(view.id, (draft) => {
            if (draft.type !== 'database_view') return;

            const existingFilter = draft.filters?.[fieldId];
            if (existingFilter) {
              setOpenedFieldFilters((prev) =>
                prev.filter((id) => id !== fieldId)
              );
              return;
            }

            if (fieldId !== SpecialId.Name) {
              const field = database.fields.find((f) => f.id === fieldId);
              if (!field) {
                return;
              }
            }

            const filter: DatabaseViewFilterAttributes = {
              id: fieldId,
              fieldId,
              type: 'field',
              operator: 'equals',
              value: '',
            };

            draft.filters = {
              ...draft.filters,
              [fieldId]: filter,
            };

            setOpenedFieldFilters((prev) => [...prev, fieldId]);
          });
        },
        initFieldSort: async (fieldId: string, direction: SortDirection) => {
          if (scope.mode === 'personal') {
            const existing = scope.state.sorts?.[fieldId];
            if (existing && existing.direction === direction) {
              return;
            }
            if (
              fieldId !== SpecialId.Name &&
              !database.fields.find((f) => f.id === fieldId)
            ) {
              return;
            }
            scope.setSort(fieldId, { id: fieldId, fieldId, direction });
            return;
          }

          if (!database.canEdit || database.isLocked) {
            return;
          }

          const existingSort = view.sorts?.[fieldId];
          if (existingSort && existingSort.direction === direction) {
            return;
          }

          workspace.collections.nodes.update(view.id, (draft) => {
            if (draft.type !== 'database_view') return;

            const existingSort = draft.sorts?.[fieldId];
            if (existingSort && existingSort.direction === direction) {
              return;
            }

            if (fieldId !== SpecialId.Name) {
              const field = database.fields.find((f) => f.id === fieldId);
              if (!field) {
                return;
              }
            }

            const sort: DatabaseViewSortAttributes = {
              id: fieldId,
              fieldId,
              direction,
            };

            draft.sorts = {
              ...draft.sorts,
              [fieldId]: sort,
            };
          });
        },
        openSearchBar: () => {
          setIsSearchBarOpened(true);
        },
        closeSearchBar: () => {
          setIsSearchBarOpened(false);
        },
        openSorts: () => {
          setIsSortsOpened(true);
        },
        closeSorts: () => {
          setIsSortsOpened(false);
        },
        openFieldFilter: (fieldId: string) => {
          setOpenedFieldFilters((prev) => [...prev, fieldId]);
        },
        closeFieldFilter: (fieldId: string) => {
          setOpenedFieldFilters((prev) => prev.filter((id) => id !== fieldId));
        },
        createRecord: async (filters?: DatabaseViewFilterAttributes[]) => {
          const viewFilters = Object.values(view.filters ?? {}) ?? [];
          const extraFilters = filters ?? [];

          const allFilters = [...viewFilters, ...extraFilters];
          const fields = generateFieldValuesFromFilters(
            database.fields,
            allFilters,
            workspace.userId
          );

          const openRecord = (recordId: string) => {
            navigate({
              from: '/workspace/$userId/$nodeId',
              to: 'modal/$modalNodeId',
              params: { modalNodeId: recordId },
            });
          };

          const insertBlank = () => {
            const recordId = generateId(IdType.Record);
            const record: LocalRecordNode = {
              id: recordId,
              type: 'record',
              parentId: database.id,
              rootId: database.rootId,
              databaseId: database.id,
              name: '',
              fields,
              createdAt: new Date().toISOString(),
              createdBy: workspace.userId,
              updatedAt: null,
              updatedBy: null,
              localRevision: '0',
              serverRevision: '0',
            };

            workspace.collections.nodes.insert(record);
            openRecord(record.id);
          };

          // When the database defines a default template, "New record" clones
          // that template (its field values + document) instead of inserting a
          // blank record. Falls back to a blank record if the template was
          // deleted or the clone fails, so record creation never dead-ends.
          if (database.defaultTemplateId) {
            createFromTemplate({
              input: {
                type: 'record.template.create',
                userId: workspace.userId,
                templateId: database.defaultTemplateId,
                fieldOverrides: fields,
              },
              onSuccess(output) {
                openRecord(output.id);
              },
              onError() {
                insertBlank();
              },
            });
            return;
          }

          insertBlank();
        },
      }}
    >
      <div className="w-full h-full group/database">
        <Suspense fallback={<ViewSkeleton />}>
          {match(view.layout)
            .with('table', () => <TableView />)
            .with('board', () => <BoardView />)
            .with('calendar', () => <CalendarView />)
            .with('gallery', () => <GalleryView />)
            .with('list', () => <ListView />)
            .with('chart', () => <ChartView />)
            .exhaustive()}
        </Suspense>
      </div>
    </DatabaseViewContext.Provider>
  );
};
