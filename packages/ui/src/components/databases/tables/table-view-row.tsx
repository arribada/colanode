import { LocalRecordNode } from '@colanode/client/types';
import { extractNodeRole } from '@colanode/core';
import { TableViewNameCell } from '@colanode/ui/components/databases/tables/table-view-name-cell';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { useTableCellRange } from '@colanode/ui/contexts/table-cell-range';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useTableFill } from '@colanode/ui/contexts/table-fill';
import { useTableSelection } from '@colanode/ui/contexts/table-selection';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { getRecordConditionalColorClass } from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

interface TableViewRowProps {
  index: number;
  record: LocalRecordNode;
}

export const TableViewRow = ({ index, record }: TableViewRowProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();
  const selection = useTableSelection();
  const selected = selection?.isSelected(record.id) ?? false;
  const fill = useTableFill();
  const range = useTableCellRange();
  const canFill = database.canEdit && !database.isLocked;
  const role = extractNodeRole(record, workspace.userId) ?? database.role;
  const colorClass = getRecordConditionalColorClass(
    record,
    view.conditionalColors,
    database.fields,
    workspace.userId
  );

  return (
    <RecordProvider record={record} role={role}>
      <div
        data-testid={`table-row-${record.id}`}
        className={cn(
          'group/row animate-fade-in flex flex-row items-center gap-0.5 border-b transition-colors hover:bg-muted/30',
          selected && 'bg-accent/40',
          colorClass
        )}
      >
        <span
          className="flex items-center justify-center text-sm text-muted-foreground"
          style={{ width: '30px', minWidth: '30px' }}
        >
          <span className={cn('group-hover/row:hidden', selected && 'hidden')}>
            {index + 1}
          </span>
          <input
            type="checkbox"
            aria-label="Select row"
            checked={selected}
            onChange={() => selection?.toggle(record.id)}
            className={cn(
              'size-3.5 cursor-pointer accent-blue-600',
              !selected && 'hidden group-hover/row:block'
            )}
          />
        </span>
        <div
          className="h-8 border-r overflow-hidden"
          style={{ width: `${view.nameWidth}px`, minWidth: '300px' }}
        >
          <TableViewNameCell record={record} />
        </div>
        {view.fields.map((field, col) => {
          const inFillRange = fill?.isInFillRange(index, col) ?? false;
          const inRange = range?.isSelected(index, col) ?? false;
          return (
            <div
              key={`row-${record.id}-${field.field.id}`}
              className={cn(
                'group/cell relative h-8 border-r p-1 overflow-hidden',
                inFillRange && 'bg-blue-100/70 dark:bg-blue-900/40',
                inRange &&
                  'bg-blue-200/70 ring-1 ring-inset ring-blue-400 dark:bg-blue-800/50 dark:ring-blue-500'
              )}
              style={{ width: `${field.width}px` }}
              // Ctrl (or Cmd) + press starts a cell-range selection. Capture
              // phase so it fires before the cell's own editor opens.
              onPointerDownCapture={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  range?.beginAt(index, col);
                }
              }}
              onPointerEnter={() => {
                fill?.enter(index, col);
                range?.extendTo(index, col);
              }}
            >
              <RecordFieldValue field={field.field} />
              {canFill && (
                <span
                  role="presentation"
                  title="Drag to fill — across rows and columns"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fill?.start(index, col);
                  }}
                  className="absolute bottom-0 right-0 size-1.5 cursor-crosshair rounded-sm bg-blue-500 opacity-0 group-hover/cell:opacity-100"
                />
              )}
            </div>
          );
        })}
        <div className="w-8" />
      </div>
    </RecordProvider>
  );
};
