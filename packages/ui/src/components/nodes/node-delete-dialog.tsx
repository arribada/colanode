import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';

import { getIdType, IdType } from '@colanode/core';
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
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

interface NodeDeleteDialogProps {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Node types that go to the trash instead of being deleted permanently.
// Mirrors softDeletableNodeTypes in @colanode/core (id types map 1:1).
const softDeleteIdTypes: IdType[] = [
  IdType.Page,
  IdType.Folder,
  IdType.Database,
  IdType.Record,
  IdType.File,
  IdType.Whiteboard,
];

export const NodeDeleteDialog = ({
  id,
  title,
  description,
  open,
  onOpenChange,
}: NodeDeleteDialogProps) => {
  const workspace = useWorkspace();
  const router = useRouter();
  const { mutate, isPending } = useMutation();

  const softDelete = softDeleteIdTypes.includes(getIdType(id));

  // if the current node is opened in a modal we just navigate to the node route
  // if the current node is opened in a full screen view we just navigate to the home route
  const navigateAway = () => {
    const matches = router.state.matches.toReversed();

    for (const match of matches) {
      if (
        match.routeId === '/workspace/$userId/$nodeId/modal/$modalNodeId' &&
        match.params.modalNodeId === id
      ) {
        router.navigate({
          to: '/workspace/$userId/$nodeId',
          params: {
            userId: workspace.userId,
            nodeId: match.params.nodeId,
          },
        });
      }

      if (
        match.routeId === '/workspace/$userId/$nodeId' &&
        match.params.nodeId === id
      ) {
        router.navigate({
          to: '/workspace/$userId/home',
          params: {
            userId: workspace.userId,
          },
        });
      }
    }
  };

  const handleDelete = () => {
    if (softDelete) {
      // Soft delete: the node gets a deletedAt attribute and moves to the
      // workspace trash, from where it can be restored or deleted forever.
      mutate({
        input: {
          type: 'node.trash',
          userId: workspace.userId,
          nodeId: id,
        },
        onError(error) {
          toast.error(error.message);
        },
      });
    } else {
      workspace.collections.nodes.delete(id);
    }

    navigateAway();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {softDelete
              ? 'It will be moved to the trash. You can restore it later from the workspace trash.'
              : description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            data-testid="node-delete-confirm-button"
          >
            {softDelete ? 'Move to trash' : 'Delete'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
