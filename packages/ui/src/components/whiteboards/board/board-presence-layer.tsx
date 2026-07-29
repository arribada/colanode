import { BoardScene, getIdType, IdType, PresenceState } from '@colanode/core';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { elementRect } from '@colanode/ui/lib/board/elements';
import { presenceInitials, withAlpha } from '@colanode/ui/lib/presence';

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

const isImageAvatar = (avatar: string | null | undefined): avatar is string =>
  !!avatar && getIdType(avatar) === IdType.Avatar;

// A small circular initials fallback used on the cursor flag when no avatar
// image is available (or while it loads).
const InitialsCircle = ({
  cx,
  cy,
  r,
  color,
  name,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  name: string;
}) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill={color} stroke="#ffffff" strokeWidth={1} />
    <text
      x={cx}
      y={cy}
      fontSize={9}
      fontWeight={600}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ userSelect: 'none' }}
    >
      {presenceInitials(name)}
    </text>
  </g>
);

// Resolves and renders the collaborator's real avatar image, clipped to a
// circle, falling back to initials while pending / on failure.
const CursorAvatarImage = ({
  avatarId,
  cx,
  cy,
  r,
  clipId,
  color,
  name,
}: {
  avatarId: string;
  cx: number;
  cy: number;
  r: number;
  clipId: string;
  color: string;
  name: string;
}) => {
  const workspace = useWorkspace();
  const query = useLiveQuery({
    type: 'avatar.get',
    accountId: workspace.accountId,
    avatarId,
  });

  const url = query.data?.url;
  if (!url) {
    return <InitialsCircle cx={cx} cy={cy} r={r} color={color} name={name} />;
  }

  return (
    <g>
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <image
        href={url}
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid slice"
      />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff" strokeWidth={1} />
    </g>
  );
};

const RemoteCursor = ({ presence }: { presence: PresenceState }) => {
  const pointer = presence.payload.pointer;
  if (!pointer) {
    return null;
  }
  const name = presence.name || 'Anonymous';
  const labelWidth = estimateLabelWidth(name);
  const clipId = `cursor-avatar-${presence.userId}-${presence.deviceId}`;
  const r = 8;
  const cx = 8;
  const cy = 8;

  return (
    <g>
      <path
        d="M0 0 L0 17 L4.5 13 L7.5 19.5 L10 18.3 L7 12 L12 12 Z"
        fill={presence.color}
        stroke="#ffffff"
        strokeWidth={1}
      />
      <g transform="translate(14 13)">
        {isImageAvatar(presence.avatar) ? (
          <CursorAvatarImage
            avatarId={presence.avatar}
            cx={cx}
            cy={cy}
            r={r}
            clipId={clipId}
            color={presence.color}
            name={name}
          />
        ) : (
          <InitialsCircle cx={cx} cy={cy} r={r} color={presence.color} name={name} />
        )}
        <rect
          x={20}
          y={0}
          rx={3}
          ry={3}
          width={labelWidth}
          height={16}
          fill={presence.color}
        />
        <text
          x={26}
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
};

/**
 * Renders remote collaborators on the whiteboard: an outline around every
 * element they have selected / are editing (scene space, so it tracks the
 * element), a colored pointer flag carrying their real avatar (screen space,
 * constant size), and a "🔒 {name} édite" soft-lock badge over any element
 * they have open for inline editing. Purely visual — never receives pointer
 * events.
 */
export const BoardPresenceLayer = ({
  presences,
  viewport,
  scene,
}: BoardPresenceLayerProps) => {
  const sceneTransform = `translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Remote selections / dragged / edited elements (scene space). */}
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

      {/* Soft-lock badges over elements a collaborator is editing (screen
          space, so a constant readable size regardless of zoom). */}
      {presences.map((presence) => {
        const editingId = presence.payload.editingElementId;
        if (!editingId) {
          return null;
        }
        const element = scene[editingId];
        if (!element) {
          return null;
        }
        const rect = elementRect(element);
        const screenX = viewport.x + rect.x * viewport.zoom;
        const screenY = viewport.y + rect.y * viewport.zoom;
        const label = `🔒 ${presence.name || 'Anonymous'} édite`;
        const width = estimateLabelWidth(label) + 6;
        return (
          <g
            key={`lock:${presence.userId}:${presence.deviceId}`}
            transform={`translate(${screenX} ${screenY - 20})`}
          >
            <rect
              x={0}
              y={0}
              rx={3}
              ry={3}
              width={width}
              height={17}
              fill={presence.color}
              opacity={0.95}
            />
            <text
              x={6}
              y={12}
              fontSize={11}
              fill="#ffffff"
              style={{ userSelect: 'none' }}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Remote pointer flags with real avatars (screen space). */}
      {presences.map((presence) => (
        <RemoteCursor
          key={`${presence.userId}:${presence.deviceId}`}
          presence={presence}
        />
      ))}
    </g>
  );
};
