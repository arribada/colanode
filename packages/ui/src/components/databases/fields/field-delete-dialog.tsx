import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@colanode/ui/components/ui/alert-dialog';
import { Button } from '@colanode/ui/components/ui/button';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface FieldDeleteDialogProps {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FieldDeleteDialog = ({
  id,
  open,
  onOpenChange,
}: FieldDeleteDialogProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Are you sure you want delete this field?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This field will no longer be
            accessible and all data in the field will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            data-testid="field-delete-confirm-button"
            onClick={async () => {
              const nodes = workspace.collections.nodes;

              // If this is a bidirectional relation, the mirror field on the
              // target database still points back at this (about-to-be-deleted)
              // field via relatedFieldId. Clear that dangling pointer first so
              // the reverse column does not reference a field that no longer
              // exists.
              const deleted = database.fields.find((f) => f.id === id);
              if (
                deleted &&
                deleted.type === 'relation' &&
                deleted.relatedFieldId &&
                deleted.databaseId
              ) {
                const reverseId = deleted.relatedFieldId;
                nodes.update(deleted.databaseId, (draft) => {
                  if (draft.type !== 'database') {
                    return;
                  }
                  const reverse = draft.fields[reverseId];
                  if (reverse && reverse.type === 'relation') {
                    reverse.relatedFieldId = null;
                  }
                });
              }

              nodes.update(database.id, (draft) => {
                if (draft.type !== 'database') {
                  return;
                }

                const { [id]: _removed, ...rest } = draft.fields;
                draft.fields = rest;
              });
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
