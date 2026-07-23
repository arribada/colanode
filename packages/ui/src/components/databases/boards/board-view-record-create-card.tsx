import { Plus } from 'lucide-react';

import { DatabaseViewFilterAttributes } from '@colanode/core';
import { RecordTemplateMenu } from '@colanode/ui/components/records/record-template-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

interface BoardViewRecordCreateCardProps {
  filters: DatabaseViewFilterAttributes[];
  columnId: string;
}

export const BoardViewRecordCreateCard = ({
  filters,
  columnId,
}: BoardViewRecordCreateCardProps) => {
  const database = useDatabase();
  const view = useDatabaseView();

  if (!database.canCreateRecord) {
    return null;
  }

  return (
    <div className="animate-fade-in mt-2 flex h-8 w-full flex-row items-center rounded-md">
      <button
        type="button"
        data-testid={`board-record-create-button-${columnId}`}
        className="flex h-8 flex-1 cursor-pointer flex-row items-center gap-1 rounded-md text-muted-foreground hover:bg-accent"
        onClick={() => view.createRecord(filters)}
      >
        <Plus className="size-4" />
        <span className="text-sm">Add record</span>
      </button>
      <RecordTemplateMenu filters={filters} />
    </div>
  );
};
