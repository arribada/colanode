import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { Filter } from 'lucide-react';

import { LocalDatabaseNode } from '@colanode/client/types';
import { DatabaseViewFilterAttributes } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Database } from '@colanode/ui/components/databases/database';
import { DatabaseSelect } from '@colanode/ui/components/databases/database-select';
import { DatabaseViews } from '@colanode/ui/components/databases/database-views';
import { NodeProvider } from '@colanode/ui/components/nodes/node-provider';
import { Link } from '@colanode/ui/components/ui/link';
import { useNode } from '@colanode/ui/contexts/node';

// Inner content only -- the single NodeViewWrapper lives in DatabaseNodeView so
// that ProseMirror always gets a wrapper root even while NodeProvider renders a
// loading skeleton or an unavailable state (returning those bare used to throw
// tiptap's "Please use the NodeViewWrapper" and kill the whole embed).
const DatabaseNodeViewContent = ({
  id,
  inline,
  extraFilters,
  filterFieldId,
  filterValue,
}: {
  id: string;
  inline?: boolean;
  extraFilters?: DatabaseViewFilterAttributes[];
  filterFieldId?: string | null;
  filterValue?: string | null;
}) => {
  const { node: database, role } = useNode<LocalDatabaseNode>();

  // The embed id can transiently resolve to a non-database node during sync,
  // or point at a deleted/replaced node; rendering <Database> then runs
  // Object.values(database.fields) on undefined and throws into the page.
  if (database.type !== 'database') {
    return null;
  }

  if (inline) {
    // Resolve a human label for the per-embed filter so it is visible on the
    // view (the filter is applied at query level, not stored on the view node).
    const filterField = filterFieldId
      ? database.fields?.[filterFieldId]
      : undefined;
    const filterOptionName =
      filterField && filterField.type === 'select' && filterValue
        ? filterField.options?.[filterValue]?.name
        : undefined;

    return (
      <>
        {filterOptionName ? (
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="size-3 shrink-0" />
            <span>
              Filtered: {filterField?.name ?? 'Field'} is{' '}
              <span className="font-medium text-foreground">
                {filterOptionName}
              </span>
            </span>
          </div>
        ) : null}
        <Database database={database} role={role}>
          <DatabaseViews inline extraFilters={extraFilters} />
        </Database>
      </>
    );
  }

  const name = database.name ?? 'Unnamed';
  const avatar = database.avatar;

  return (
    <Link from="/workspace/$userId" to="$nodeId" params={{ nodeId: id }}>
      <div className="my-0.5 flex h-10 w-full cursor-pointer flex-row items-center gap-1 rounded-md p-1 hover:bg-accent">
        <Avatar size="small" id={id} name={name} avatar={avatar} />
        <div role="presentation" className="grow">
          {name}
        </div>
      </div>
    </Link>
  );
};

const DatabaseNodeViewPicker = ({
  editable,
  onPick,
}: {
  editable: boolean;
  onPick: (databaseId: string) => void;
}) => {
  return (
    <div className="flex w-full flex-row items-center gap-2 rounded-md border border-dashed border-border p-2">
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        Linked database
      </span>
      {editable ? (
        <div className="grow">
          <DatabaseSelect id={null} onChange={onPick} />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">
          No database selected
        </span>
      )}
    </div>
  );
};

export const DatabaseNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const id = node.attrs.id;
  const filterFieldId = node.attrs.filterFieldId as string | null;
  const filterValue = node.attrs.filterValue as string | null;
  const extraFilters: DatabaseViewFilterAttributes[] =
    filterFieldId && filterValue
      ? [
          {
            id: 'embed-filter',
            type: 'field',
            fieldId: filterFieldId,
            operator: 'is_in',
            value: [filterValue],
          },
        ]
      : [];

  // A SINGLE wrapper is the node view root in every state (picker, loading,
  // unavailable, inline table, link row) so ProseMirror never sees a render
  // without a NodeViewWrapper.
  return (
    <NodeViewWrapper
      data-id={id ?? undefined}
      className="my-4 w-full min-w-0"
      contentEditable={false}
      // Isolate drags that start INSIDE the embed (field headers) from the page
      // editor; and never let grabbing a column-resize handle start a drag of
      // this draggable atom (that killed in-embed column resizing).
      onDragStartCapture={(e: React.DragEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('.cn-col-resize-handle')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        e.stopPropagation();
      }}
    >
      {!id ? (
        <DatabaseNodeViewPicker
          editable={editor.isEditable}
          onPick={(databaseId) => {
            updateAttributes({ id: databaseId });
          }}
        />
      ) : (
        <NodeProvider nodeId={id}>
          <DatabaseNodeViewContent
            id={id}
            inline={node.attrs.inline}
            extraFilters={extraFilters}
            filterFieldId={filterFieldId}
            filterValue={filterValue}
          />
        </NodeProvider>
      )}
    </NodeViewWrapper>
  );
};
