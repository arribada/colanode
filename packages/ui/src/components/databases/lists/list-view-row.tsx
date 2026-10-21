import { LocalRecordNode } from '@colanode/client/types';
import { RecordDropIndicator } from '@colanode/ui/components/databases/record-drop-indicator';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordDragDrop } from '@colanode/ui/hooks/use-record-reorder';
import {
  getRecordConditionalColorClass,
  isRecordFieldEmpty,
} from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

interface ListViewRowProps {
  // The rows as the list shows them: where a dropped row lands.
  ordered: readonly LocalRecordNode[];
}

export const ListViewRow = ({ ordered }: ListViewRowProps) => {
  const database = useDatabase();
  const workspace = useWorkspace();
  const view = useDatabaseView();
  const record = useRecord();
  const dnd = useRecordDragDrop({
    record,
    ordered,
    axis: 'vertical',
  });
  const colorClass = getRecordConditionalColorClass(
    record,
    view.conditionalColors,
    database.fields,
    workspace.userId
  );

  const name = record.name;
  const hasName = name !== null && name !== '';
  const visibleFields = view.fields.filter(
    (viewField) => !isRecordFieldEmpty(viewField.field, record)
  );

  return (
    <div
      ref={(node) => {
        dnd.elementRef.current = node;
        dnd.drag(dnd.drop(node));
      }}
      title={dnd.hint ?? undefined}
      className={cn('relative', dnd.isDragging && 'opacity-40')}
    >
      <RecordDropIndicator edge={dnd.dropEdge} axis="vertical" />
      <Link
        from="/workspace/$userId/$nodeId"
        to="modal/$modalNodeId"
        params={{ modalNodeId: record.id }}
        key={record.id}
        draggable={false}
        data-testid={`list-row-${record.id}`}
        className={cn(
          'animate-fade-in flex h-9 cursor-pointer flex-row items-center gap-3 rounded-md border-b px-2 transition-colors hover:bg-accent/60',
          colorClass
        )}
      >
        <span
          className={cn(
            'min-w-0 shrink truncate text-sm font-medium',
            !hasName && 'text-muted-foreground'
          )}
        >
          {hasName ? name : 'Unnamed'}
        </span>
        {visibleFields.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-row items-center justify-end gap-3">
            {visibleFields.map((viewField) => (
              <div
                key={viewField.field.id}
                className="max-w-50 shrink-0 overflow-hidden text-sm text-muted-foreground"
              >
                <RecordFieldValue field={viewField.field} readOnly={true} />
              </div>
            ))}
          </div>
        )}
      </Link>
    </div>
  );
};
