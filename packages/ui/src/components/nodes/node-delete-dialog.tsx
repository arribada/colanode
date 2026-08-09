import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';

import { MutationErrorCode } from '@colanode/client/mutations';
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
import { useNodeUndo } from '@colanode/ui/contexts/node-undo';
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
  const { push: pushUndo } = useNodeUndo();

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
      const trashed = workspace.collections.nodes.get(id);
      const name =
        trashed && 'name' in trashed ? (trashed.name ?? 'Unnamed') : 'Unnamed';
      mutate({
        input: {
          type: 'node.trash',
          userId: workspace.userId,
          nodeId: id,
        },
        onSuccess: (output) => {
          if (!output.success) {
            return;
          }
          // node.restore clears deletedAt on the node (and any trashed
          // ancestor), the exact inverse of node.trash. Fire it straight
          // through the runtime: this dialog unmounts on close, so we can't
          // lean on the component-bound mutate hook here.
          const restore = () => {
            void window.colanode
              .executeMutation({
                type: 'node.restore',
                userId: workspace.userId,
                nodeId: id,
              })
              .then((result) => {
                if (!result.success) {
                  toast.error(`Couldn't restore "${name}"`);
                }
              })
              .catch(() => {
                toast.error(`Couldn't restore "${name}"`);
              });
          };
          pushUndo(restore);
          toast(`Deleted "${name}"`, {
            action: {
              label: 'Undo',
              onClick: restore,
            },
          });
        },
        onError(error) {
          // A soft-delete-type ghost (e.g. a whiteboard left in the local
          // cache but already gone server-side) can't be trashed because it
          // isn't in the local database. Rather than leave the user stuck,
          // remove it from the view directly; any other error is surfaced.
          const code = (error as { code?: string } | null)?.code;
          if (code === MutationErrorCode.NodeNotFound) {
            workspace.collections.nodes.delete(id);
            toast(`Removed \"${title}\"`);
            return;
          }
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
