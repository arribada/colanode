import { Suspense, lazy } from 'react';

import { LocalNode } from '@colanode/client/types';
import { NodeRole } from '@colanode/core';
import { Spinner } from '@colanode/ui/components/ui/spinner';

const WhiteboardCanvas = lazy(() =>
  import('@colanode/ui/components/whiteboards/whiteboard-canvas').then(
    (module) => ({ default: module.WhiteboardCanvas })
  )
);

interface WhiteboardContainerProps {
  node: LocalNode;
  role: NodeRole;
  // When true the board is rendered as an in-page embed: the wheel/touch
  // handlers yield to page scrolling and the collaboration controls +
  // presence broadcasting are suppressed (see WhiteboardCanvas).
  embedded?: boolean;
  // Which node attribute holds the persisted scene (whiteboard `scene` vs a
  // page/folder `boardScene`). Forwarded to WhiteboardCanvas; defaults to
  // `scene`.
  sceneField?: 'scene' | 'boardScene';
  initialViewport?: { x: number; y: number; zoom: number };
  onViewport?: (viewport: { x: number; y: number; zoom: number }) => void;
}

export const WhiteboardContainer = ({
  node,
  role,
  embedded = false,
  sceneField = 'scene',
  initialViewport,
  onViewport,
}: WhiteboardContainerProps) => {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <Spinner className="size-6" />
        </div>
      }
    >
      <WhiteboardCanvas
        node={node}
        role={role}
        embedded={embedded}
        sceneField={sceneField}
        initialViewport={initialViewport}
        onViewport={onViewport}
      />
    </Suspense>
  );
};
