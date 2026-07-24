import { BoardScene, PresenceState } from '@colanode/core';
import { elementRect } from '@colanode/ui/lib/board/elements';
import { withAlpha } from '@colanode/ui/lib/presence';

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface BoardPresenceLayerProps {
  presences: PresenceState[];
  viewport: Viewport;
  scene: BoardScene;
}

const estimateLabelWidth = (name: string): number =>
  Math.max(24, name.length * 6.5 + 12);

/**
 * Renders remote collaborators on the whiteboard: an outline around every
 * element they have selected (in scene space, so it tracks the element) and a
 * colored pointer with a name flag (in screen space, so it stays a constant
 * size regardless of zoom). Purely visual — never receives pointer events.
 */
export const BoardPresenceLayer = ({
  presences,
  viewport,
  scene,
}: BoardPresenceLayerProps) => {
  const sceneTransform = `translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Remote selections / dragged elements (scene space). */}
      <g transform={sceneTransform}>
        {presences.map((presence) => {
          const ids = presence.payload.selectedElementIds ?? [];
          const editingId = presence.payload.editingElementId;
          const highlightIds = editingId ? [...ids, editingId] : ids;
          return highlightIds.map((id) => {
            const element = scene[id];
            if (!element) {
              return null;
            }
            const rect = elementRect(element);
            const rotation = element.rotation ?? 0;
            const cx = rect.x + rect.w / 2;
            const cy = rect.y + rect.h / 2;
            return (
              <rect
                key={`${presence.userId}:${presence.deviceId}:${id}`}
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                fill={withAlpha(presence.color, 0.1)}
                stroke={presence.color}
                strokeWidth={1.5}
                strokeDasharray={editingId === id ? '4 3' : undefined}
                vectorEffect="non-scaling-stroke"
                transform={`rotate(${rotation} ${cx} ${cy})`}
              />
            );
          });
        })}
      </g>

      {/* Remote pointers (screen space). */}
      {presences.map((presence) => {
        const pointer = presence.payload.pointer;
        if (!pointer) {
          return null;
        }
        const screenX = viewport.x + pointer.x * viewport.zoom;
        const screenY = viewport.y + pointer.y * viewport.zoom;
        const name = presence.name || 'Anonymous';
        const labelWidth = estimateLabelWidth(name);
        return (
          <g
            key={`${presence.userId}:${presence.deviceId}`}
            transform={`translate(${screenX} ${screenY})`}
          >
            <path
              d="M0 0 L0 17 L4.5 13 L7.5 19.5 L10 18.3 L7 12 L12 12 Z"
              fill={presence.color}
              stroke="#ffffff"
              strokeWidth={1}
            />
            <g transform="translate(13 13)">
              <rect
                x={0}
                y={0}
                rx={3}
                ry={3}
                width={labelWidth}
                height={16}
                fill={presence.color}
              />
              <text
                x={6}
                y={12}
                fontSize={11}
                fill="#ffffff"
                style={{ userSelect: 'none' }}
              >
                {name}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
};
