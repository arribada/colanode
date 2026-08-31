import { Plus } from 'lucide-react';

import { FieldCreatePopover } from '@colanode/ui/components/databases/fields/field-create-popover';
import { TableViewFieldHeader } from '@colanode/ui/components/databases/tables/table-view-field-header';
import { TableViewNameHeader } from '@colanode/ui/components/databases/tables/table-view-name-header';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useTableSelection } from '@colanode/ui/contexts/table-selection';

export const TableViewHeader = () => {
  const database = useDatabase();
  const view = useDatabaseView();
  const selection = useTableSelection();

  return (
    <div className="flex flex-row items-center gap-0.5">
      <div
        className="flex items-center justify-center"
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
      <TableViewNameHeader />
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
