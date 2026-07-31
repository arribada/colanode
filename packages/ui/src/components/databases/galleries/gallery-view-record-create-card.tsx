import { Plus } from 'lucide-react';

import { RecordTemplateMenu } from '@colanode/ui/components/records/record-template-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const GalleryViewRecordCreateCard = () => {
  const database = useDatabase();
  const view = useDatabaseView();

  if (!database.canCreateRecord) {
    return null;
  }

  return (
    <div className="animate-fade-in flex min-h-24 w-full flex-col items-stretch rounded-md border border-dashed">
      <button
        type="button"
        data-testid="gallery-record-create-button"
        className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md text-muted-foreground hover:bg-accent"
        onClick={() => view.createRecord()}
      >
        <Plus className="size-4" />
        <span className="text-sm">Add record</span>
      </button>
      <RecordTemplateMenu />
    </div>
  );
};
