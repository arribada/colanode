import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  GALLERY_CARD_MAX_FIELDS,
  getGalleryCoverColorClass,
  getRecordConditionalColorClass,
} from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

export const GalleryViewCard = () => {
  const database = useDatabase();
  const workspace = useWorkspace();
  const view = useDatabaseView();
  const record = useRecord();
  const colorClass = getRecordConditionalColorClass(
    record,
    view.conditionalColors,
    database.fields,
    workspace.userId
  );

  const name = record.name;
  const hasName = name !== null && name !== '';
  const cardFields = view.fields.slice(0, GALLERY_CARD_MAX_FIELDS);

  return (
    <Link
      from="/workspace/$userId/$nodeId"
      to="modal/$modalNodeId"
      params={{ modalNodeId: record.id }}
      key={record.id}
      data-testid={`gallery-card-${record.id}`}
      className={cn(
        'animate-fade-in flex cursor-pointer flex-col overflow-hidden rounded-md border hover:bg-accent',
        colorClass
      )}
    >
      <div
        className={cn(
          'flex h-20 w-full shrink-0 items-center justify-center',
          getGalleryCoverColorClass(record.id)
        )}
      >
        <Avatar
          id={record.id}
          name={hasName ? name : 'Unnamed'}
          avatar={record.avatar}
          className="size-8"
        />
      </div>
      <div className="flex flex-col gap-1 p-2">
        <p
          className={cn(
            'truncate text-sm font-medium',
            !hasName && 'text-muted-foreground'
          )}
        >
          {hasName ? name : 'Unnamed'}
        </p>
        {cardFields.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {cardFields.map((viewField) => (
              <div key={viewField.field.id} className="overflow-hidden">
                <RecordFieldValue field={viewField.field} readOnly={true} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};
