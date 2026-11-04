// ABOUTME: The table layout drawn as a plain document table: every visible field of every
// ABOUTME: record in full, text wrapped, read-only. An option of the view; the grid is the default.
import { InView } from 'react-intersection-observer';

import { FieldAttributes, extractNodeRole } from '@colanode/core';
import { TableViewEmptyPlaceholder } from '@colanode/ui/components/databases/tables/table-view-empty-placeholder';
import { TableViewSkeleton } from '@colanode/ui/components/databases/tables/table-view-skeleton';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';
import { cn } from '@colanode/ui/lib/utils';

// The records a relation points to, by name, one per line. A device only
// holds part of the workspace (a register's records arrive as they are
// opened), so the ones not here yet are counted rather than left blank.
const PlainRelation = ({ ids }: { ids: string[] }) => {
  const workspace = useWorkspace();
  const query = useLiveQuery({
    type: 'node.list',
    userId: workspace.userId,
    filters: [{ field: ['id'], operator: 'in', value: ids }],
    sorts: [],
  });
  const names = (query.data ?? [])
    .filter((node) => node.type === 'record')
    .map((node) => node.name || 'Untitled')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const missing = ids.length - names.length;

  return (
    <span className="flex flex-col gap-0.5">
      {names.map((name, i) => (
        <span key={`${name}-${i}`}>{name}</span>
      ))}
      {missing > 0 && (
        <span className="text-xs text-muted-foreground">
          {names.length > 0 ? `+${missing} more` : `${ids.length} linked`}
        </span>
      )}
    </span>
  );
};

// Text, numbers and links are written out in full here: their grid cells are
// one-line inputs that cut a statement after a few words. Every other type
// (options, relations, people, dates, files) keeps its own read-only display.
const PlainValue = ({ field }: { field: FieldAttributes }) => {
  const record = useRecord();
  const value = record.fields[field.id];

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone': {
      const text =
        value && (value.type === 'text' || value.type === 'string')
          ? value.value
          : '';
      return <span className="whitespace-pre-wrap break-words">{text}</span>;
    }
    case 'number':
      return <span>{value?.type === 'number' ? String(value.value) : ''}</span>;
    case 'relation': {
      const ids = value?.type === 'string_array' ? value.value : [];
      return ids.length > 0 ? <PlainRelation ids={ids} /> : null;
    }
    case 'url': {
      const href = value?.type === 'string' ? value.value : '';
      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline-offset-2 hover:underline"
        >
          {href}
        </a>
      ) : null;
    }
    default:
      return (
        <div className="[&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal">
          <RecordFieldValue field={field} readOnly />
        </div>
      );
  }
};

export const TableViewPlain = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(view.filters, view.sorts);
  const records = data;
  const fields = view.fields;

  if (isLoading && records.length === 0) {
    return <TableViewSkeleton />;
  }

  return (
    <div className="w-full overflow-x-auto pb-2" data-testid="table-view-plain">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              className="border border-border bg-muted/50 px-2 py-1.5 text-left align-bottom font-semibold"
              style={{ minWidth: view.nameWidth }}
            >
              Name
            </th>
            {fields.map((viewField) => (
              <th
                key={viewField.field.id}
                className="border border-border bg-muted/50 px-2 py-1.5 text-left align-bottom font-semibold"
                style={{ minWidth: viewField.width }}
              >
                {viewField.field.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => {
            const role =
              extractNodeRole(record, workspace.userId) ?? database.role;
            return (
              <RecordProvider key={record.id} record={record} role={role}>
                <tr
                  className={cn(view.zebra && index % 2 === 1 && 'bg-muted/40')}
                >
                  <td className="border border-border px-2 py-1.5 align-top font-medium">
                    <Link
                      from="/workspace/$userId/$nodeId"
                      to="modal/$modalNodeId"
                      params={{ modalNodeId: record.id }}
                      className="hover:underline"
                    >
                      {record.name || 'Untitled'}
                    </Link>
                  </td>
                  {fields.map((viewField) => (
                    <td
                      key={viewField.field.id}
                      className="border border-border px-2 py-1.5 align-top"
                    >
                      <PlainValue field={viewField.field} />
                    </td>
                  ))}
                </tr>
              </RecordProvider>
            );
          })}
        </tbody>
      </table>
      {records.length === 0 && <TableViewEmptyPlaceholder />}
      <InView
        rootMargin="200px"
        onChange={(inView) => {
          if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
      ></InView>
    </div>
  );
};
