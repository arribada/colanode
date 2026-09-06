import { useRef } from 'react';
import { useDrag } from 'react-dnd';

import { FieldAttributes } from '@colanode/core';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { cn } from '@colanode/ui/lib/utils';

interface CalendarViewRecordCardProps {
  field: FieldAttributes;
}

export const CalendarViewRecordCard = ({
  field,
}: CalendarViewRecordCardProps) => {
  const view = useDatabaseView();
  const record = useRecord();

  const name = record.name;
  const hasName = name !== null && name !== '';

  // Only real `date` fields can be rescheduled by dragging the card;
  // created_at / updated_at are server-derived and read-only.
  const canReschedule = field.type === 'date' && record.canEdit;

  const [{ isDragging }, drag] = useDrag({
    type: 'calendar-record',
    canDrag: () => canReschedule,
    item: { id: record.id, canEdit: record.canEdit },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = drag(wrapperRef);

  return (
    <div
      ref={dragRef as React.Ref<HTMLDivElement>}
      role="presentation"
      className={cn(canReschedule && 'cursor-grab', isDragging && 'opacity-50')}
    >
      <Link
        from="/workspace/$userId/$nodeId"
        to="modal/$modalNodeId"
        params={{ modalNodeId: record.id }}
        key={record.id}
        data-testid={`calendar-card-${record.id}`}
        className="animate-fade-in flex justify-start items-start cursor-pointer flex-col gap-1 rounded-md border p-1 pl-2 hover:bg-accent"
      >
        <p
          className={cn(
            'w-full truncate text-sm',
            hasName ? '' : 'text-muted-foreground'
          )}
        >
          {hasName ? name : 'Unnamed'}
        </p>
        {view.fields.length > 0 && (
          <div className="flex flex-col gap-1 mt-2">
            {view.fields.map((viewField) => {
              if (!viewField.display) {
                return null;
              }

              return (
                <div key={viewField.field.id}>
                  <RecordFieldValue field={viewField.field} readOnly={true} />
                </div>
              );
            })}
          </div>
        )}
      </Link>
    </div>
  );
};
