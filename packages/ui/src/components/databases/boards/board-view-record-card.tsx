import { useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';

import { LocalRecordNode } from '@colanode/client/types';
import { FieldValue } from '@colanode/core';
import { RecordDropIndicator } from '@colanode/ui/components/databases/record-drop-indicator';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useBoardView } from '@colanode/ui/contexts/board-view';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  dropEdgeAt,
  useRecordReorder,
} from '@colanode/ui/hooks/use-record-reorder';
import {
  getRecordConditionalColorClass,
  isRecordFieldEmpty,
} from '@colanode/ui/lib/databases';
import { DropEdge, positionForDrop } from '@colanode/ui/lib/record-position';
import { cn } from '@colanode/ui/lib/utils';

interface BoardViewRecordCardProps {
  // The cards as this column shows them: where a dropped card lands.
  ordered: readonly LocalRecordNode[];
}

export const BoardViewRecordCard = ({ ordered }: BoardViewRecordCardProps) => {
  const view = useDatabaseView();
  const boardView = useBoardView();
  const record = useRecord();
  const database = useDatabase();
  const workspace = useWorkspace();
  const colorClass = getRecordConditionalColorClass(
    record,
    view.conditionalColors,
    database.fields,
    workspace.userId
  );

  const reorder = useRecordReorder();

  const [{ isDragging }, drag] = useDrag({
    type: 'board-record',
    canDrag: () => boardView.canDrag(record),
    item: record,
    end: (item, monitor) => {
      const result = monitor.getDropResult() as {
        value: FieldValue | null;
        position?: string;
      } | null;
      if (!result) {
        return;
      }
      // The column decides the group value; a drop on a card or below the
      // last one also gives the card its place in that column.
      boardView.onDragEnd(item, result.value);
      if (result.position) {
        reorder.setPosition(item.id, result.position);
      }
    },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  // Another card dropped on this one goes just above or below it.
  const edgeRef = useRef<DropEdge>('after');
  const [edge, setEdge] = useState<DropEdge>('after');
  const [{ isOver }, drop] = useDrop({
    accept: 'board-record',
    canDrop: (item: typeof record) =>
      item.id !== record.id && boardView.canDrop(item),
    hover: (_item, monitor) => {
      const next = dropEdgeAt(
        buttonRef.current,
        monitor.getClientOffset(),
        'vertical'
      );
      edgeRef.current = next;
      setEdge(next);
    },
    drop: (item: typeof record) => ({
      value: boardView.drop(item),
      position: reorder.canReorder
        ? positionForDrop(ordered, item.id, record.id, edgeRef.current)
        : undefined,
    }),
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
    }),
  });

  const buttonRef = useRef<HTMLDivElement | null>(null);
  const dragRef = (node: HTMLDivElement | null) => {
    buttonRef.current = node;
    drag(drop(node));
  };
  const name = record.name;
  const hasName = name !== null && name !== '';

  const visibleFields = view.fields.filter(
    (viewField) =>
      viewField.display && !isRecordFieldEmpty(viewField.field, record)
  );

  return (
    <div
      ref={dragRef}
      role="presentation"
      key={record.id}
      data-testid={`board-card-${record.id}`}
      className={cn(
        'animate-fade-in relative flex cursor-pointer flex-col gap-1 rounded-lg border border-border/60 bg-card p-2.5 text-left shadow-sm transition-all hover:border-border hover:shadow-md',
        isDragging && 'opacity-40',
        colorClass
      )}
    >
      <RecordDropIndicator edge={isOver ? edge : null} axis="vertical" />
      <Link
        from="/workspace/$userId/$nodeId"
        to="modal/$modalNodeId"
        params={{ modalNodeId: record.id }}
      >
        <p
          className={cn(
            'text-sm font-medium leading-snug',
            !hasName && 'text-muted-foreground'
          )}
        >
          {hasName ? name : 'Unnamed'}
        </p>
        {visibleFields.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {visibleFields.map((viewField) => (
              <div key={viewField.field.id}>
                <RecordFieldValue field={viewField.field} readOnly={true} />
              </div>
            ))}
          </div>
        )}
      </Link>
    </div>
  );
};
