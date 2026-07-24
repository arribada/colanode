import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
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
import { BOARD_TEMPLATES } from '@colanode/ui/lib/board/templates';
import { cn } from '@colanode/ui/lib/utils';

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
  const [templateId, setTemplateId] = useState('blank');

  const { mutate } = useMutation({
    mutationFn: async (values: WhiteboardFormValues) => {
      const whiteboardId = generateId(IdType.Whiteboard);
      const nodes = workspace.collections.nodes;
      const template = BOARD_TEMPLATES.find((t) => t.id === templateId);
      const scene = template ? template.build() : {};

      const whiteboard: LocalWhiteboardNode = {
        id: whiteboardId,
        type: 'whiteboard',
        name: values.name,
        avatar: values.avatar,
        parentId: spaceId,
        rootId: spaceId,
        scene,
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
          <DialogTitle>Create board</DialogTitle>
          <DialogDescription>
            Start from a template to sketch, plan and brainstorm visually
          </DialogDescription>
        </DialogHeader>

        <div className="mb-2">
          <p className="mb-1.5 text-sm font-medium">Template</p>
          <div className="grid grid-cols-3 gap-2">
            {BOARD_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setTemplateId(template.id)}
                title={template.description}
                className={cn(
                  'rounded-md border p-2 text-left text-xs transition-colors hover:border-primary/60',
                  templateId === template.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                )}
              >
                <span className="block font-medium">{template.name}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </div>

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
