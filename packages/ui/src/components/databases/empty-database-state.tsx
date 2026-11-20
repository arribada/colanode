// ABOUTME: Shared empty-state for database views — an icon plus "New record",
// ABOUTME: "New from template" and "Import CSV" actions instead of a bare label.
import { Database, Plus, SearchX, Upload, X } from 'lucide-react';
import { useState } from 'react';

import { ViewImportCsvDialog } from '@colanode/ui/components/databases/view-import-csv-dialog';
import { RecordTemplateMenu } from '@colanode/ui/components/records/record-template-menu';
import { Button } from '@colanode/ui/components/ui/button';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { cn } from '@colanode/ui/lib/utils';

interface EmptyDatabaseStateProps {
  // Layout-specific container classes (borders, grid span, min-height) merged
  // onto the shared centered layout via tailwind-merge.
  className?: string;
}

export const EmptyDatabaseState = ({ className }: EmptyDatabaseStateProps) => {
  const database = useDatabase();
  const view = useDatabaseView();

  const [openImport, setOpenImport] = useState(false);

  const canCreate = database.canCreateRecord;
  const canImport = database.canCreateRecord && !database.isLocked;

  // A search or a filter that keeps nothing is not an empty database: saying
  // "No records yet" there sent people to create records that already exist.
  const searchText = view.searchText.trim();
  if (searchText.length > 0) {
    return (
      <div
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground',
          className
        )}
        data-testid="empty-database-search"
      >
        <SearchX className="size-8" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">
            No records match “{searchText}”
          </p>
          <p>
            The search looks at every record of this database, in its name and
            in what its fields show.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => view.setSearchText('')}
        >
          <X className="size-4" />
          Clear search
        </Button>
      </div>
    );
  }
  const filtered = view.filters.length > 0;

  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground',
        className
      )}
    >
      <Database className="size-8" />
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">
          {filtered ? 'No records match this view’s filters' : 'No records yet'}
        </p>
        <p>
          {filtered
            ? canCreate
              ? 'Change or remove a filter to see more, or add a record.'
              : 'Change or remove a filter to see more.'
            : canCreate
              ? 'Create your first record, start from a template, or import a CSV.'
              : 'This view has no records yet.'}
        </p>
      </div>
      {canCreate && (
        <div className="flex flex-row flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            data-testid="empty-database-create-record"
            onClick={() => view.createRecord()}
          >
            <Plus className="size-4" />
            New record
          </Button>
          <RecordTemplateMenu />
          {canImport && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpenImport(true)}
            >
              <Upload className="size-4" />
              Import CSV
            </Button>
          )}
        </div>
      )}
      {openImport && (
        <ViewImportCsvDialog open={openImport} onOpenChange={setOpenImport} />
      )}
    </div>
  );
};
