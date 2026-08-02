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
  // When true the board is rendered as an in-page embed: the wheel/touch
  // handlers yield to page scrolling and the collaboration controls +
  // presence broadcasting are suppressed (see WhiteboardCanvas).
  embedded?: boolean;
}

export const WhiteboardContainer = ({
  whiteboard,
  role,
  embedded = false,
}: WhiteboardContainerProps) => {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <Spinner className="size-6" />
        </div>
      }
    >
      <WhiteboardCanvas whiteboard={whiteboard} role={role} embedded={embedded} />
    </Suspense>
  );
};
