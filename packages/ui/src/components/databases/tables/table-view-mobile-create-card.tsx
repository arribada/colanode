import { Plus } from 'lucide-react';

import { RecordTemplateMenu } from '@colanode/ui/components/records/record-template-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

// "Add record" affordance for the mobile table card list, mirroring the
// list-view create row but styled as a card so it lines up with the
// stacked record cards above it.
export const TableViewMobileCreateCard = () => {
  const database = useDatabase();
  const view = useDatabaseView();

  if (!database.canCreateRecord) {
    return null;
  }

  return (
    <div className="animate-fade-in flex w-full flex-row items-center rounded-lg border border-dashed border-border/60">
      <button
        type="button"
        data-testid="table-mobile-record-create-button"
        className="flex h-11 flex-1 cursor-pointer flex-row items-center gap-1 pl-3 text-muted-foreground hover:text-foreground"
        onClick={() => view.createRecord()}
      >
        <Plus className="size-4" />
        <span className="text-sm">Add record</span>
      </button>
      <RecordTemplateMenu />
    </div>
  );
};
