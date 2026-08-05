import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useNavigate } from '@tanstack/react-router';

import { NodeContainer } from '@colanode/ui/components/nodes/node-container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';
import { cn } from '@colanode/ui/lib/utils';

interface NodeModalProps {
  nodeId: string;
}
export const NodeModal = ({ nodeId }: NodeModalProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          navigate({
            from: '/workspace/$userId/$nodeId/modal/$modalNodeId',
            to: '/workspace/$userId/$nodeId',
          });
        }
      }}
      modal={true}
    >
      <DialogContent
        className={cn(
          'overflow-hidden p-2',
          // On a phone the 90vw peek is cramped and there is no comfortable
          // outside-tap zone, so go edge-to-edge with a real close button.
          // 100dvh tracks the dynamic viewport (browser chrome in/out).
          isMobile
            ? 'h-[100dvh] max-h-none min-h-0 w-screen max-w-none min-w-0 rounded-none border-0'
            : 'h-[90vh] max-h-[90vh] min-h-[90vh] w-[90vw] min-w-[90vw] max-w-[90vw]'
        )}
        showCloseButton={isMobile}
      >
        <VisuallyHidden>
          <DialogTitle>Modal</DialogTitle>
          <DialogDescription>
            This is a modal window. It is used to display a node in a modal
            window.
          </DialogDescription>
        </VisuallyHidden>
        <div className="h-full w-full overflow-hidden">
          <NodeContainer
            type="modal"
            nodeId={nodeId}
            onFullscreen={() => {
              navigate({
                from: '/workspace/$userId/$nodeId/modal/$modalNodeId',
                to: '/workspace/$userId/$nodeId',
                params: {
                  nodeId: nodeId,
                },
              });
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
