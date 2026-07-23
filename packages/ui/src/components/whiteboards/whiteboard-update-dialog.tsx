import { LocalWhiteboardNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import {
  WhiteboardForm,
  WhiteboardFormValues,
} from '@colanode/ui/components/whiteboards/whiteboard-form';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface WhiteboardUpdateDialogProps {
  whiteboard: LocalWhiteboardNode;
  role: NodeRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WhiteboardUpdateDialog = ({
  whiteboard,
  role,
  open,
  onOpenChange,
}: WhiteboardUpdateDialogProps) => {
  const workspace = useWorkspace();
  const canEdit = hasNodeRole(role, 'editor');

  const handleSubmit = (values: WhiteboardFormValues) => {
    const nodes = workspace.collections.nodes;
    if (!nodes.has(whiteboard.id)) {
      return;
    }

    nodes.update(whiteboard.id, (draft) => {
      if (draft.type !== 'whiteboard') {
        return;
      }

      draft.name = values.name;
      draft.avatar = values.avatar;
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update whiteboard</DialogTitle>
          <DialogDescription>
            Update the whiteboard name and icon
          </DialogDescription>
        </DialogHeader>
        <WhiteboardForm
          id={whiteboard.id}
          values={{
            name: whiteboard.name,
            avatar: whiteboard.avatar,
          }}
          submitText="Update"
          testId="whiteboard-update-submit"
          readOnly={!canEdit}
          onCancel={() => {
            onOpenChange(false);
          }}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
};
