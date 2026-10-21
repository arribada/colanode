import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react';
import { useState } from 'react';

import { FieldAttributes } from '@colanode/core';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { FieldCreatePopover } from '@colanode/ui/components/databases/fields/field-create-popover';
import { RecordAvatar } from '@colanode/ui/components/records/record-avatar';
import { RecordField } from '@colanode/ui/components/records/record-field';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { RecordLinkedReferences } from '@colanode/ui/components/records/record-linked-references';
import { RecordName } from '@colanode/ui/components/records/record-name';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useMoveDatabaseField } from '@colanode/ui/hooks/use-field-reorder';
import { useReorderItem } from '@colanode/ui/hooks/use-index-reorder';
import { useRecordPropertiesThreshold } from '@colanode/ui/hooks/use-record-properties-threshold';
import { sortByIndex } from '@colanode/ui/lib/reorder-index';
import { cn } from '@colanode/ui/lib/utils';

export const RecordAttributes = () => {
  const database = useDatabase();
  const canAddField = database.canEdit && !database.isLocked;
  const [threshold] = useRecordPropertiesThreshold();
  const [expanded, setExpanded] = useState(false);

  // In the order the properties are arranged in (sortByIndex copies, so the
  // store's array is never sorted in place).
  const fields = sortByIndex(database.fields);

  // Collapse only when there are strictly more fields than the threshold. When
  // collapsed, show the first `threshold` fields and hide the rest behind a
  // toggle. Collapsed is the default state whenever collapsing applies.
  const isCollapsible = fields.length > threshold;
  const visibleFields =
    isCollapsible && !expanded ? fields.slice(0, threshold) : fields;
  const hiddenCount = fields.length - threshold;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-2">
        <RecordAvatar />
        <RecordName />
      </div>
      <div className="flex flex-col gap-2">
        {visibleFields.map((field) => (
          <RecordAttributeRow key={field.id} field={field} />
        ))}
      </div>
      {isCollapsible && (
        <button
          type="button"
          data-testid="record-properties-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-fit flex-row items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronDown className="size-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronRight className="size-4" />
              Show {hiddenCount} more{' '}
              {hiddenCount === 1 ? 'property' : 'properties'}
            </>
          )}
        </button>
      )}
      {canAddField && (
        <div className="mt-1">
          <FieldCreatePopover
            button={
              <button
                type="button"
                data-testid="record-add-property"
                className="flex w-full flex-row items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-4" />
                Add a property
              </button>
            }
          />
        </div>
      )}
      <RecordLinkedReferences />
    </div>
  );
};

// One property of the record. Its grip, in the margin, drags it above or below
// another: the order every record of the database shows.
const RecordAttributeRow = ({ field }: { field: FieldAttributes }) => {
  const database = useDatabase();
  const fieldsReorder = useMoveDatabaseField();
  const dnd = useReorderItem({
    type: `record-field:${database.id}`,
    id: field.id,
    axis: 'vertical',
    enabled: fieldsReorder.canReorder,
    onMove: fieldsReorder.move,
  });

  return (
    <div
      ref={(node) => {
        dnd.elementRef.current = node;
        dnd.drop(node);
        dnd.preview(node);
      }}
      data-testid={`record-attribute-row-${field.id}`}
      className={cn(
        'group/attr relative flex h-8 flex-row gap-2',
        dnd.isDragging && 'opacity-40'
      )}
    >
      <DropIndicator edge={dnd.dropEdge} axis="vertical" />
      {fieldsReorder.canReorder && (
        <span
          ref={(node) => {
            dnd.drag(node);
          }}
          role="presentation"
          title="Drag to reorder properties"
          data-testid={`record-attribute-grip-${field.id}`}
          className="absolute top-2 -left-5 flex cursor-grab items-center text-muted-foreground opacity-0 group-hover/attr:opacity-100"
        >
          <GripVertical className="size-3.5" />
        </span>
      )}
      <div className="w-40 max-w-40 md:w-60 md:max-w-60">
        <RecordField field={field} />
      </div>
      <div className="flex-1 max-w-lg p-1">
        <RecordFieldValue field={field} />
      </div>
    </div>
  );
};
