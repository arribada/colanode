import { LocalRecordNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { RecordDropIndicator } from '@colanode/ui/components/databases/record-drop-indicator';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordDragDrop } from '@colanode/ui/hooks/use-record-reorder';
import {
  GALLERY_CARD_MAX_FIELDS,
  getGalleryCoverColorClass,
  getRecordConditionalColorClass,
  isRecordFieldEmpty,
} from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

interface GalleryViewCardProps {
  // The cards as the gallery shows them: where a dropped card lands.
  ordered: readonly LocalRecordNode[];
}

export const GalleryViewCard = ({ ordered }: GalleryViewCardProps) => {
  const database = useDatabase();
  const workspace = useWorkspace();
  const view = useDatabaseView();
  const record = useRecord();
  // Cards flow in rows, left to right: the side of the card decides.
  const dnd = useRecordDragDrop({
    record,
    ordered,
    axis: 'horizontal',
  });
  const colorClass = getRecordConditionalColorClass(
    record,
    view.conditionalColors,
    database.fields,
    workspace.userId
  );

  const name = record.name;
  const hasName = name !== null && name !== '';
  const cardFields = view.fields
    .filter((viewField) => !isRecordFieldEmpty(viewField.field, record))
    .slice(0, GALLERY_CARD_MAX_FIELDS);

  return (
    <div
      ref={(node) => {
        dnd.elementRef.current = node;
        dnd.drag(dnd.drop(node));
      }}
      title={dnd.hint ?? undefined}
      className={cn('relative flex', dnd.isDragging && 'opacity-40')}
    >
      <RecordDropIndicator edge={dnd.dropEdge} axis="horizontal" />
      <Link
        from="/workspace/$userId/$nodeId"
        to="modal/$modalNodeId"
        params={{ modalNodeId: record.id }}
        key={record.id}
        draggable={false}
        data-testid={`gallery-card-${record.id}`}
        className={cn(
          'animate-fade-in flex min-w-0 flex-1 cursor-pointer flex-col overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm transition-all hover:border-border hover:shadow-md',
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
        <div className="flex flex-col gap-1 p-2.5">
          <p
            className={cn(
              'truncate text-sm font-medium',
              !hasName && 'text-muted-foreground'
            )}
          >
            {hasName ? name : 'Unnamed'}
          </p>
          {cardFields.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5">
              {cardFields.map((viewField) => (
                <div key={viewField.field.id} className="overflow-hidden">
                  <RecordFieldValue field={viewField.field} readOnly={true} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
};
