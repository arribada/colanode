import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  getRecordConditionalColorClass,
  isRecordFieldEmpty,
} from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

// One record rendered as a stacked card for the mobile `table` layout.
// Shows the record name as a heading, then each visible non-empty field
// as a label + value row stacked vertically so nothing needs horizontal
// scrolling. Tapping the card opens the record modal, same as a table
// row / list row on desktop.
export const TableViewMobileCard = () => {
  const database = useDatabase();
  const workspace = useWorkspace();
  const view = useDatabaseView();
  const record = useRecord();
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
    <Link
      from="/workspace/$userId/$nodeId"
      to="modal/$modalNodeId"
      params={{ modalNodeId: record.id }}
      key={record.id}
      data-testid={`table-mobile-card-${record.id}`}
      className={cn(
        'animate-fade-in flex cursor-pointer flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 shadow-sm transition-colors hover:border-border',
        colorClass
      )}
    >
      <p
        className={cn(
          'truncate text-sm font-medium',
          !hasName && 'text-muted-foreground'
        )}
      >
        {hasName ? name : 'Unnamed'}
      </p>
      {visibleFields.length > 0 && (
        <div className="flex flex-col gap-2">
          {visibleFields.map((viewField) => (
            <div
              key={viewField.field.id}
              className="flex flex-col gap-0.5 border-t border-border/40 pt-2 first:border-t-0 first:pt-0"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {viewField.field.name}
              </span>
              <div className="min-w-0 overflow-hidden text-sm">
                <RecordFieldValue field={viewField.field} readOnly={true} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
};
