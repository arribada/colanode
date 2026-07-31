import { Suspense, lazy } from 'react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { NodeRole } from '@colanode/core';
import { Spinner } from '@colanode/ui/components/ui/spinner';

const WhiteboardCanvas = lazy(() =>
  import('@colanode/ui/components/whiteboards/whiteboard-canvas').then(
    (module) => ({ default: module.WhiteboardCanvas })
  )
);

interface WhiteboardContainerProps {
  whiteboard: LocalWhiteboardNode;
  role: NodeRole;
}

export const WhiteboardContainer = ({
  whiteboard,
  role,
}: WhiteboardContainerProps) => {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <Spinner className="size-6" />
        </div>
      }
    >
      <WhiteboardCanvas whiteboard={whiteboard} role={role} />
    </Suspense>
  );
};
