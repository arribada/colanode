import { useRef } from 'react';
import { useDrag } from 'react-dnd';

import { FieldValue } from '@colanode/core';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useBoardView } from '@colanode/ui/contexts/board-view';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  getRecordConditionalColorClass,
  isRecordFieldEmpty,
} from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

export const BoardViewRecordCard = () => {
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

  const [, drag] = useDrag({
    type: 'board-record',
    canDrag: () => boardView.canDrag(record),
    item: record,
    end: (item, monitor) => {
      const value = monitor.getDropResult() as { value: FieldValue | null };
      return boardView.onDragEnd(item, value.value);
    },
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragRef = drag(buttonRef);
  const name = record.name;
  const hasName = name !== null && name !== '';

  const visibleFields = view.fields.filter(
    (viewField) =>
      viewField.display && !isRecordFieldEmpty(viewField.field, record)
  );

  return (
    <div
      ref={dragRef as React.Ref<HTMLDivElement>}
      role="presentation"
      key={record.id}
      data-testid={`board-card-${record.id}`}
      className={cn(
        'animate-fade-in flex cursor-pointer flex-col gap-1 rounded-lg border border-border/60 bg-card p-2.5 text-left shadow-sm transition-all hover:border-border hover:shadow-md',
        colorClass
      )}
    >
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
