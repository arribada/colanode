// ABOUTME: Shared empty-state for database views — an icon plus "New record",
// ABOUTME: "New from template" and "Import CSV" actions instead of a bare label.
import { Database, Plus, Upload } from 'lucide-react';
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

  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground',
        className
      )}
    >
      <Database className="size-8" />
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">No records yet</p>
        <p>
          {canCreate
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
