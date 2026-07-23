import { Plus } from 'lucide-react';

import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const GalleryViewRecordCreateCard = () => {
  const database = useDatabase();
  const view = useDatabaseView();

  if (!database.canCreateRecord) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="gallery-record-create-button"
      className="animate-fade-in flex min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-accent"
      onClick={() => view.createRecord()}
    >
      <Plus className="size-4" />
      <span className="text-sm">Add record</span>
    </button>
  );
};
