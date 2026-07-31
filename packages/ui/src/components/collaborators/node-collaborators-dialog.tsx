import { Node, NodeRole } from '@colanode/core';
import { NodeCollaborators } from '@colanode/ui/components/collaborators/node-collaborators';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';

interface NodeCollaboratorsDialogProps {
  node: Node;
  nodes: Node[];
  role: NodeRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NodeCollaboratorsDialog = ({
  node,
  nodes,
  role,
  open,
  onOpenChange,
}: NodeCollaboratorsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-128 w-full max-w-lg overflow-auto">
        <DialogHeader>
          <DialogTitle>Collaborators</DialogTitle>
        </DialogHeader>
        <NodeCollaborators node={node} nodes={nodes} role={role} />
      </DialogContent>
    </Dialog>
  );
};
