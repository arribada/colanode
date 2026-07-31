import { eq, useLiveQuery } from '@tanstack/react-db';
import { SquareCheckBig } from 'lucide-react';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import { SelectFieldAttributes } from '@colanode/core';
import { SelectOptionBadge } from '@colanode/ui/components/databases/fields/select-option-badge';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface MessageTaskBadgeProps {
  taskId: string;
}

const NeutralBadge = () => (
  <span className="mt-1 flex w-fit items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
    <SquareCheckBig className="size-3.5" />
    Task created
  </span>
);

export const MessageTaskBadge = ({ taskId }: MessageTaskBadgeProps) => {
  const workspace = useWorkspace();

  // Both live queries must run unconditionally on every render (Rules of Hooks).
  // The database query is dependent on the record, so until the record resolves
  // it filters on '' (no match → undefined data) — same pattern as
  // thread-panel-content.tsx's dependent rootNode query.
  const recordQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, taskId))
        .findOne(),
    [workspace.userId, taskId]
  );

  const record =
    recordQuery.data?.type === 'record'
      ? (recordQuery.data as LocalRecordNode)
      : null;

  const databaseQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, record?.databaseId ?? ''))
        .findOne(),
    [workspace.userId, record?.databaseId]
  );

  // The record itself has not synced locally yet — show the neutral fallback.
  if (recordQuery.isLoading || !record) {
    return <NeutralBadge />;
  }

  const database =
    databaseQuery.data?.type === 'database'
      ? (databaseQuery.data as LocalDatabaseNode)
      : null;

  // shortcut: "status" is the first select field by index — the same heuristic
  // message-create-task-dialog.tsx uses when writing the status, so reader and
  // writer agree. Upgrade path: persist the chosen status field id on the record
  // (or a per-database task-status field setting) and read it explicitly here.
  const statusField: SelectFieldAttributes | null = database
    ? ((Object.values(database.fields)
        .filter((f) => f.type === 'select')
        .sort((a, b) => a.index.localeCompare(b.index))[0] as
        | SelectFieldAttributes
        | undefined) ?? null)
    : null;

  const fieldValue = statusField ? record.fields[statusField.id] : undefined;
  const optionId = fieldValue?.type === 'string' ? fieldValue.value : undefined;
  const selectedOption = optionId
    ? statusField?.options?.[optionId]
    : undefined;

  return (
    <Link
      from="/workspace/$userId/$nodeId"
      to="modal/$modalNodeId"
      params={{ modalNodeId: taskId }}
      className="mt-1 inline-flex w-fit items-center gap-1.5"
    >
      {selectedOption ? (
        <SelectOptionBadge
          name={selectedOption.name}
          color={selectedOption.color}
        />
      ) : (
        <NeutralBadge />
      )}
    </Link>
  );
};
