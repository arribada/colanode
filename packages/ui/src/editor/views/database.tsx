import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';

import { LocalDatabaseNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Database } from '@colanode/ui/components/databases/database';
import { DatabaseSelect } from '@colanode/ui/components/databases/database-select';
import { DatabaseViews } from '@colanode/ui/components/databases/database-views';
import { NodeProvider } from '@colanode/ui/components/nodes/node-provider';
import { Link } from '@colanode/ui/components/ui/link';
import { useNode } from '@colanode/ui/contexts/node';

const DatabaseNodeViewContent = ({
  id,
  inline,
}: {
  id: string;
  inline?: boolean;
}) => {
  const { node: database, role } = useNode<LocalDatabaseNode>();

  if (inline) {
    return (
      <NodeViewWrapper
        data-id={id}
        className="my-4 w-full"
        contentEditable={false}
        onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Database database={database} role={role}>
          <DatabaseViews inline />
        </Database>
      </NodeViewWrapper>
    );
  }

  const name = database.name ?? 'Unnamed';
  const avatar = database.avatar;

  return (
    <NodeViewWrapper data-id={id}>
      <Link from="/workspace/$userId" to="$nodeId" params={{ nodeId: id }}>
        <div className="my-0.5 flex h-10 w-full cursor-pointer flex-row items-center gap-1 rounded-md p-1 hover:bg-accent">
          <Avatar size="small" id={id} name={name} avatar={avatar} />
          <div role="presentation" className="grow">
            {name}
          </div>
        </div>
      </Link>
    </NodeViewWrapper>
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
    <NodeViewWrapper className="my-4 w-full" contentEditable={false}>
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
    </NodeViewWrapper>
  );
};

export const DatabaseNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const id = node.attrs.id;

  if (!id) {
    return (
      <DatabaseNodeViewPicker
        editable={editor.isEditable}
        onPick={(databaseId) => {
          updateAttributes({ id: databaseId });
        }}
      />
    );
  }

  return (
    <NodeProvider nodeId={id}>
      <DatabaseNodeViewContent id={id} inline={node.attrs.inline} />
    </NodeProvider>
  );
};
