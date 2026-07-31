import { Plus } from 'lucide-react';

import { RecordTemplateMenu } from '@colanode/ui/components/records/record-template-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const TableViewRecordCreateRow = () => {
  const database = useDatabase();
  const view = useDatabaseView();

  if (!database.canCreateRecord) {
    return null;
  }

  return (
    <div className="animate-fade-in flex h-8 w-full flex-row items-center border-b">
      <button
        type="button"
        data-testid="table-record-create-button"
        className="flex h-8 flex-1 cursor-pointer flex-row items-center gap-1 pl-2 text-muted-foreground hover:bg-accent"
        onClick={() => view.createRecord()}
      >
        <Plus className="size-4" />
        <span className="text-sm">Add record</span>
      </button>
      <RecordTemplateMenu />
    </div>
  );
};
