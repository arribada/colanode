import { useState } from 'react';
import { toast } from 'sonner';

import { LocalNode } from '@colanode/client/types';
import { formatDate } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
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

const nodeTypeLabels: Record<string, string> = {
  page: 'Page',
  folder: 'Folder',
  database: 'Database',
  record: 'Record',
  file: 'File',
  whiteboard: 'Whiteboard',
};

interface WorkspaceTrashItemProps {
  node: LocalNode;
}

export const WorkspaceTrashItem = ({ node }: WorkspaceTrashItemProps) => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();
  const [deleteForeverOpen, setDeleteForeverOpen] = useState(false);

  const name = 'name' in node && node.name ? node.name : 'Untitled';
  const avatar = 'avatar' in node ? (node.avatar ?? null) : null;
  const typeLabel = nodeTypeLabels[node.type] ?? node.type;
  const deletedAt =
    'deletedAt' in node && node.deletedAt ? formatDate(node.deletedAt) : null;

  const handleRestore = () => {
    mutate({
      input: {
        type: 'node.restore',
        userId: workspace.userId,
        nodeId: node.id,
      },
      onSuccess() {
        toast.success(`${typeLabel} restored`);
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const handleDeleteForever = () => {
    mutate({
      input: {
        type: 'node.delete',
        userId: workspace.userId,
        nodeId: node.id,
      },
      onError(error) {
        toast.error(error.message);
      },
    });
    setDeleteForeverOpen(false);
  };

  return (
    <div
      className="flex w-full items-center gap-3 rounded-md border border-border p-2"
      data-testid={`trash-item-${node.id}`}
    >
      <Avatar id={node.id} name={name} avatar={avatar} className="size-6" />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm">{name}</span>
        <span className="text-xs text-muted-foreground">
          {typeLabel}
          {deletedAt ? ` · Deleted ${deletedAt}` : ''}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleRestore}
        data-testid={`trash-restore-${node.id}`}
      >
        Restore
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => setDeleteForeverOpen(true)}
        data-testid={`trash-delete-forever-${node.id}`}
      >
        Delete forever
      </Button>
      <AlertDialog
        open={deleteForeverOpen}
        onOpenChange={setDeleteForeverOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{name}&quot; forever?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This {typeLabel.toLowerCase()} and
              everything inside it will be permanently deleted for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteForever}
              data-testid="trash-delete-forever-confirm-button"
            >
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
