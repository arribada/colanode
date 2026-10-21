// ABOUTME: Writes the indexes a drag decided: a select option's place, a property's
// ABOUTME: place in the database or in one view, a view tab's place among its views.
import { useCallback } from 'react';

import {
  FieldAttributes,
  MultiSelectFieldAttributes,
  SelectFieldAttributes,
} from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  Indexed,
  ReorderEdge,
  reorderByIndex,
} from '@colanode/ui/lib/reorder-index';

type Move = (draggedId: string, targetId: string, edge: ReorderEdge) => void;

const useCanArrange = () => {
  const database = useDatabase();
  return database.canEdit && !database.isLocked;
};

// The options of a select or multi-select field, which also order a board's
// columns and every option list.
export const useMoveSelectOption = (
  field: SelectFieldAttributes | MultiSelectFieldAttributes
): { canReorder: boolean; move: Move } => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const canReorder = useCanArrange();

  const move = useCallback<Move>(
    (draggedId, targetId, edge) => {
      const written = reorderByIndex(
        Object.values(field.options ?? {}),
        draggedId,
        targetId,
        edge
      );
      if (Object.keys(written).length === 0) {
        return;
      }
      workspace.collections.nodes.update(database.id, (draft) => {
        if (draft.type !== 'database') {
          return;
        }
        const attributes = draft.fields[field.id];
        if (
          !attributes ||
          (attributes.type !== 'select' &&
            attributes.type !== 'multi_select') ||
          !attributes.options
        ) {
          return;
        }
        for (const [id, index] of Object.entries(written)) {
          const option = attributes.options[id];
          if (option) {
            option.index = index;
          }
        }
      });
    },
    [workspace, database.id, field]
  );

  return { canReorder, move };
};

// A property's place in the database: the order of a record's page.
export const useMoveDatabaseField = (): {
  canReorder: boolean;
  move: Move;
} => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const canReorder = useCanArrange();

  const move = useCallback<Move>(
    (draggedId, targetId, edge) => {
      const written = reorderByIndex(
        database.fields as FieldAttributes[],
        draggedId,
        targetId,
        edge
      );
      if (Object.keys(written).length === 0) {
        return;
      }
      workspace.collections.nodes.update(database.id, (draft) => {
        if (draft.type !== 'database') {
          return;
        }
        for (const [id, index] of Object.entries(written)) {
          const field = draft.fields[id];
          if (field) {
            field.index = index;
          }
        }
      });
    },
    [workspace, database.id, database.fields]
  );

  return { canReorder, move };
};

// A property's place in one view: the order of its columns and card fields.
// `items` carry the index the view uses for each property (its own, else the
// database's).
export const useMoveViewField = (
  viewId: string,
  items: readonly Indexed[]
): { canReorder: boolean; move: Move } => {
  const workspace = useWorkspace();
  const canReorder = useCanArrange();

  const move = useCallback<Move>(
    (draggedId, targetId, edge) => {
      const written = reorderByIndex(items, draggedId, targetId, edge);
      if (Object.keys(written).length === 0) {
        return;
      }
      workspace.collections.nodes.update(viewId, (draft) => {
        if (draft.type !== 'database_view') {
          return;
        }
        const fields = { ...(draft.fields ?? {}) };
        for (const [id, index] of Object.entries(written)) {
          fields[id] = { ...(fields[id] ?? { id }), id, index };
        }
        draft.fields = fields;
      });
    },
    [workspace, viewId, items]
  );

  return { canReorder, move };
};

// A view's place among its database's views: the tabs, their menu and the
// sidebar. The siblings are read when the drop happens, from the shared
// collection every one of those lists is built from. Who may arrange them is
// the caller's to say: the tabs know the database's rights, the sidebar only
// the workspace role.
export const useMoveView = (
  databaseId: string,
  canReorder: boolean
): { canReorder: boolean; move: Move } => {
  const workspace = useWorkspace();

  const move = useCallback<Move>(
    (draggedId, targetId, edge) => {
      const views: Indexed[] = [];
      for (const node of workspace.collections.nodes.values()) {
        if (node.type === 'database_view' && node.parentId === databaseId) {
          views.push({ id: node.id, index: node.index });
        }
      }
      const written = reorderByIndex(views, draggedId, targetId, edge);
      for (const [id, index] of Object.entries(written)) {
        workspace.collections.nodes.update(id, (draft) => {
          if (draft.type === 'database_view') {
            draft.index = index;
          }
        });
      }
    },
    [workspace, databaseId]
  );

  return { canReorder, move };
};
