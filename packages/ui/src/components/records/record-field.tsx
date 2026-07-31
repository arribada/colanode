import { Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';

import { FieldAttributes } from '@colanode/core';
import { FieldDeleteDialog } from '@colanode/ui/components/databases/fields/field-delete-dialog';
import { FieldIcon } from '@colanode/ui/components/databases/fields/field-icon';
import { FieldRenameInput } from '@colanode/ui/components/databases/fields/field-rename-input';
import { RecordFieldAiAutofill } from '@colanode/ui/components/records/record-field-ai-autofill';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useDatabase } from '@colanode/ui/contexts/database';

interface RecordFieldProps {
  field: FieldAttributes;
}

export const RecordField = ({ field }: RecordFieldProps) => {
  const database = useDatabase();
  const [open, setOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  return (
    <Fragment>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`record-field-trigger-${field.id}`}
            className="flex h-8 w-full cursor-pointer flex-row items-center gap-1 p-1 text-sm hover:bg-accent text-left"
          >
            <FieldIcon type={field.type} className="size-4" />
            <p>{field.name}</p>
          </button>
        </PopoverTrigger>
        <PopoverContent className="ml-1 flex w-72 flex-col gap-1 p-2 text-sm">
          <FieldRenameInput field={field} />
          <Separator />
          {field.type === 'text' && (
            <RecordFieldAiAutofill
              field={field}
              onComplete={() => setOpen(false)}
            />
          )}
          {database.canEdit && !database.isLocked && (
            <button
              type="button"
              data-testid={`record-field-delete-${field.id}`}
              className="flex cursor-pointer flex-row items-center gap-2 p-1 hover:bg-accent text-left"
              onClick={() => {
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="size-4" />
              <span>Delete field</span>
            </button>
          )}
        </PopoverContent>
      </Popover>
      {showDeleteDialog && (
        <FieldDeleteDialog
          id={field.id}
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
        />
      )}
    </Fragment>
  );
};
