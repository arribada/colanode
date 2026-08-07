import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

import { FieldCreatePopover } from '@colanode/ui/components/databases/fields/field-create-popover';
import { RecordAvatar } from '@colanode/ui/components/records/record-avatar';
import { RecordField } from '@colanode/ui/components/records/record-field';
import { RecordFieldValue } from '@colanode/ui/components/records/record-field-value';
import { RecordLinkedReferences } from '@colanode/ui/components/records/record-linked-references';
import { RecordName } from '@colanode/ui/components/records/record-name';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useRecordPropertiesThreshold } from '@colanode/ui/hooks/use-record-properties-threshold';

export const RecordAttributes = () => {
  const database = useDatabase();
  const canAddField = database.canEdit && !database.isLocked;
  const [threshold] = useRecordPropertiesThreshold();
  const [expanded, setExpanded] = useState(false);

  // Copy before sorting — never mutate the store-provided fields array in place.
  const fields = [...database.fields].sort((a, b) =>
    a.index.localeCompare(b.index)
  );

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
          <div
            key={field.id}
            data-testid={`record-attribute-row-${field.id}`}
            className="flex flex-row gap-2 h-8"
          >
            <div className="w-60 max-w-60">
              <RecordField field={field} />
            </div>
            <div className="flex-1 max-w-lg p-1">
              <RecordFieldValue field={field} />
            </div>
          </div>
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
