import { Plus } from 'lucide-react';

import { FieldCreatePopover } from '@colanode/ui/components/databases/fields/field-create-popover';
import { TableViewFieldHeader } from '@colanode/ui/components/databases/tables/table-view-field-header';
import { TableViewNameHeader } from '@colanode/ui/components/databases/tables/table-view-name-header';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useDatabaseViews } from '@colanode/ui/contexts/database-views';
import { useTableSelection } from '@colanode/ui/contexts/table-selection';
import { cn } from '@colanode/ui/lib/utils';

export const TableViewHeader = () => {
  const database = useDatabase();
  const view = useDatabaseView();
  const { inline } = useDatabaseViews();
  const frozen = !inline;
  const selection = useTableSelection();

  return (
    <div className="flex flex-row items-center gap-0.5">
      <div
        className={cn(
          'flex items-center justify-center',
          frozen && 'sticky left-0 z-10 bg-background'
        )}
        style={{ width: '30px', minWidth: '30px' }}
      >
        {selection && selection.loadedIds.length > 0 && (
          <input
            type="checkbox"
            aria-label="Select all rows"
            checked={selection.allSelected}
            onChange={selection.toggleAll}
            className="size-3.5 cursor-pointer accent-blue-600"
          />
        )}
      </div>
      <div className={cn(frozen && 'sticky left-[30px] z-10 bg-background')}>
        <TableViewNameHeader />
      </div>
      {view.fields.map((field) => {
        return <TableViewFieldHeader viewField={field} key={field.field.id} />;
      })}
      {database.canEdit && !database.isLocked && (
        <FieldCreatePopover
          button={<Plus className="ml-2 size-4 cursor-pointer" />}
        />
      )}
    </div>
  );
};
