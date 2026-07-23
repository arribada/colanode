import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { cn } from '@colanode/ui/lib/utils';

export const ListViewRow = () => {
  const view = useDatabaseView();
  const record = useRecord();

  const name = record.name;
  const hasName = name !== null && name !== '';

  return (
    <Link
      from="/workspace/$userId/$nodeId"
      to="modal/$modalNodeId"
      params={{ modalNodeId: record.id }}
      key={record.id}
      data-testid={`list-row-${record.id}`}
      className="animate-fade-in flex h-9 cursor-pointer flex-row items-center gap-3 border-b px-1 hover:bg-accent"
    >
      <span
        className={cn(
          'min-w-0 shrink truncate text-sm font-medium',
          !hasName && 'text-muted-foreground'
        )}
      >
        {hasName ? name : 'Unnamed'}
      </span>
      {view.fields.length > 0 && (
        <div className="flex min-w-0 flex-1 flex-row items-center justify-end gap-3">
          {view.fields.map((viewField) => (
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
  );
};
