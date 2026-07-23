import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { generateId, IdType } from '@colanode/core';
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

interface WhiteboardCreateDialogProps {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WhiteboardCreateDialog = ({
  spaceId,
  open,
  onOpenChange,
}: WhiteboardCreateDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { mutate } = useMutation({
    mutationFn: async (values: WhiteboardFormValues) => {
      const whiteboardId = generateId(IdType.Whiteboard);
      const nodes = workspace.collections.nodes;

      const whiteboard: LocalWhiteboardNode = {
        id: whiteboardId,
        type: 'whiteboard',
        name: values.name,
        avatar: values.avatar,
        parentId: spaceId,
        rootId: spaceId,
        createdAt: new Date().toISOString(),
        createdBy: workspace.userId,
        updatedAt: null,
        updatedBy: null,
        localRevision: '0',
        serverRevision: '0',
      };

      nodes.insert(whiteboard);
      return whiteboard;
    },
    onSuccess: (whiteboard) => {
      navigate({
        to: '$nodeId',
        params: {
          nodeId: whiteboard.id,
        },
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create whiteboard</DialogTitle>
          <DialogDescription>
            Create a new whiteboard to sketch and brainstorm visually
          </DialogDescription>
        </DialogHeader>
        <WhiteboardForm
          id={generateId(IdType.Whiteboard)}
          values={{
            name: '',
          }}
          submitText="Create"
          testId="whiteboard-create-submit"
          onCancel={() => {
            onOpenChange(false);
          }}
          onSubmit={(values) => {
            mutate(values);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
