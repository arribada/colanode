import { eq, useLiveQuery as useDbLiveQuery } from '@tanstack/react-db';

import { DownloadStatus } from '@colanode/client/types';
import { BoardElement, BoardScene } from '@colanode/core';
import { Document } from '@colanode/ui/components/documents/document';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { resolveConnectorEndpoints } from '@colanode/ui/lib/board/elements';
import {
  anchoredCurveControls,
  ArrowHead,
  arrowHeadShape,
  ArrowHeadShape,
  buildConnectorPath,
  connectorArrowFrom,
  connectorBendPoints,
  connectorHandlePoint,
  connectorWaypoints,
  cubicPoint,
  pointsToSvg,
  rectCenter,
  anchorSide,
  polylineCrossings,
} from '@colanode/ui/lib/board/geometry';
import type { Point } from '@colanode/ui/lib/board/geometry';
import { tallyPoll } from '@colanode/ui/lib/board/poll';
import { boardShapePath } from '@colanode/ui/lib/board/shapes';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

// The word that goes on a typed line. Short on purpose: it sits ON the line.
const DEPENDENCY_LABEL: Record<string, string> = {
  blocks: 'blocks',
  dependsOn: 'depends on',
  relatesTo: 'relates to',
};

const SANS_FAMILY = 'Inter, system-ui, sans-serif';
const MONO_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// Rough monospace-ish average glyph width for greedy word wrapping. Exact
// metrics are unnecessary — this only needs to look balanced on screen and
// rasterize identically for PNG export (SVG <text>/<tspan>, no foreignObject).
const avgCharWidth = (fontSize: number) => fontSize * 0.55;

const wrapText = (
  text: string,
  maxWidth: number,
  fontSize: number
): string[] => {
  if (!text) {
    return [];
  }
  const charW = avgCharWidth(fontSize);
  const maxChars = Math.max(1, Math.floor(maxWidth / charW));
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
        }
        // hard-break very long words
        let w = word;
        while (w.length > maxChars) {
          lines.push(w.slice(0, maxChars));
          w = w.slice(maxChars);
        }
        current = w;
      }
    }
    lines.push(current);
  }
  return lines;
};

const dashArray = (
  style: BoardElement['style']
): string | undefined => {
  const sw = style.strokeWidth ?? 2;
  if (style.strokeStyle === 'dashed') {
    return `${sw * 3} ${sw * 2}`;
  }
  if (style.strokeStyle === 'dotted') {
    return `${sw} ${sw * 2}`;
  }
  return undefined;
};

interface LabelProps {
  element: BoardElement;
  align?: 'center' | 'start';
  padding?: number;
}

// Largest font (down to a floor) at which the wrapped text still fits inside
// the element box on both axes. Used when style.fontAuto is set so the label
// grows/shrinks with the shape instead of staying a fixed size.
const fitFontSize = (
  text: string,
  boxW: number,
  boxH: number,
  padding: number,
  ceiling: number
): number => {
  const maxW = Math.max(20, boxW - padding * 2);
  const maxH = Math.max(12, boxH - padding * 2);
  const hi = Math.min(ceiling, Math.max(8, Math.floor(boxH)));
  for (let fs = hi; fs >= 8; fs--) {
    const lines = wrapText(text, maxW, fs);
    if (lines.length * fs * 1.25 <= maxH) {
      return fs;
    }
  }
  return 8;
};

const Label = ({ element, align = 'center', padding = 10 }: LabelProps) => {
  const text = element.text;
  if (!text) {
    return null;
  }
  const fontSize = element.style.fontAuto
    ? fitFontSize(text, element.w, element.h, padding, 96)
    : (element.style.fontSize ?? 15);
  const color = element.style.color ?? '#1f2937';
  const fontWeight = element.style.fontWeight ?? 'normal';
  const maxWidth = Math.max(20, element.w - padding * 2);
  const lines = wrapText(text, maxWidth, fontSize);
  const lineHeight = fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;

  // `align` is the element type's default; an explicit choice overrides it.
  const h = element.style.textAlign ?? (align === 'center' ? 'center' : 'left');
  const v =
    element.style.verticalAlign ?? (align === 'center' ? 'middle' : 'top');

  const startY =
    v === 'middle'
      ? element.y + element.h / 2 - totalHeight / 2 + fontSize
      : v === 'bottom'
        ? element.y + element.h - padding - totalHeight + fontSize
        : element.y + padding + fontSize;

  const anchorX =
    h === 'center'
      ? element.x + element.w / 2
      : h === 'right'
        ? element.x + element.w - padding
        : element.x + padding;

  const textAnchor =
    h === 'center' ? 'middle' : h === 'right' ? 'end' : 'start';

  return (
    <text
      x={anchorX}
      y={startY}
      fill={color}
      fontSize={fontSize}
      fontWeight={fontWeight}
      textAnchor={textAnchor}
      fontFamily={
        element.style.fontFamily === 'mono' ? MONO_FAMILY : SANS_FAMILY
      }
      style={{ userSelect: 'none' }}
    >
      {lines.map((line, i) => (
        <tspan
          key={i}
          x={anchorX}
          dy={i === 0 ? 0 : lineHeight}
          // Code lives on its leading spaces; SVG collapses them
          // otherwise, and indentation is half of what makes it read.
          xmlSpace={
            element.style.fontFamily === 'mono' ? 'preserve' : undefined
          }
        >
          {line.length === 0 ? ' ' : line}
        </tspan>
      ))}
    </text>
  );
};

// An image element renders the blob URL of its backing Colanode file node,
// resolved through the local-file live query (same path as file thumbnails).
// While the file is missing / still downloading a neutral placeholder rect is
// shown. Kept as its own component so the hook lives at a stable top level.
const BoardImage = ({ element }: { element: BoardElement }) => {
  const workspace = useWorkspace();
  const localFileQuery = useLiveQuery({
    type: 'local.file.get',
    fileId: element.fileId ?? '',
    userId: workspace.userId,
  });
  const localFile = localFileQuery.data;
  const url =
    localFile &&
    localFile.downloadStatus === DownloadStatus.Completed &&
    localFile.url
      ? localFile.url
      : null;

  if (!url) {
    return (
      <rect
        x={element.x}
        y={element.y}
        width={element.w}
        height={element.h}
        rx={4}
        fill="#e2e8f0"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
    );
  }

  return (
    <image
      href={url}
      x={element.x}
      y={element.y}
      width={element.w}
      height={element.h}
      preserveAspectRatio="xMidYMid slice"
    />
  );
};

// A nodeCard element references another Colanode node. For a PAGE it mounts the
// live, always-editable <Document> editor (the same one the page route uses) so
// the page is edited in place, AFFiNE-edgeless style, with the card's top strip
// acting as a drag handle. Other node types (folder / database / whiteboard /
// file) stay lightweight - their icon, title and a muted type label, no editor,
// which also bounds how many live TipTap editors a board mounts. The referenced
// node is resolved through the same nodes collection live query the sidebar /
// sub-pages list use; while it is missing / still loading a neutral placeholder
// card is shown. Kept as its own component so the hooks live at a stable top
// level (mirrors BoardImage).
const BoardNodeCard = ({
  element,
  canEdit,
}: {
  element: BoardElement;
  canEdit: boolean;
}) => {
  const workspace = useWorkspace();
  const nodeQuery = useDbLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, element.nodeId ?? '')),
    [workspace.userId, element.nodeId]
  );
  const node = nodeQuery.data?.[0];

  const { style } = element;
  const fill = style.fill ?? '#ffffff';
  const stroke = style.stroke ?? '#cbd5e1';
  const strokeWidth = style.strokeWidth ?? 1;
  const card = (
    <rect
      x={element.x}
      y={element.y}
      width={element.w}
      height={element.h}
      rx={8}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );

  if (!node) {
    return (
      <g>
        {card}
        <text
          x={element.x + 12}
          y={element.y + element.h / 2 + 5}
          fill="#94a3b8"
          fontSize={style.fontSize ?? 14}
          fontFamily="Inter, system-ui, sans-serif"
          style={{ userSelect: 'none' }}
        >
          Loading...
        </text>
      </g>
    );
  }

  const { name, avatar, label } = getMentionNodeDisplay(node);
  // An emoji avatar doubles as an inline icon; image / uploaded avatars can't
  // render inline so they are skipped.
  const icon =
    avatar && avatar.length <= 4 && !avatar.includes('/') ? avatar : null;
  const isPage = node.type === 'page';

  return (
    <g>
      {card}
      <foreignObject
        x={element.x}
        y={element.y}
        width={element.w}
        height={element.h}
      >
        <div
          className="bg-background text-foreground"
          style={{
            boxSizing: 'border-box',
            width: '100%',
            height: '100%',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 8,
            overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {/* Drag handle. A pointerdown here is deliberately NOT stopped, so it
              bubbles to the parent <g data-el-id> and the board's delegated
              handler selects / drags the card. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
              minWidth: 0,
              padding: '6px 10px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'grab',
              userSelect: 'none',
            }}
          >
            {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </span>
          </div>
          {isPage ? (
            // The live page editor. Pointer / wheel / double-click events are
            // stopped here so typing, selecting and scrolling inside the page
            // never reach the board (no drag, no zoom) and a double-click never
            // opens the node fullscreen. The board drives drag/select with
            // POINTER events while the editor selects text with MOUSE events, so
            // stopping pointer/wheel/dblclick leaves editing fully intact.
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                pointerEvents: 'auto',
                fontSize: 13,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <Document node={node} canEdit={canEdit} />
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: '6px 10px',
                fontSize: 11,
                color: '#94a3b8',
                userSelect: 'none',
              }}
            >
              {label}
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
};

interface BoardElementViewProps {
  /** Who is looking — a poll highlights that person's own choices. */
  currentUserId?: string;
  element: BoardElement;
  scene: BoardScene;
  editing?: boolean;
  canEdit: boolean;
}

/**
 * Routes this connector is allowed to hop over.
 *
 * When both lines of a crossing have jumps on, only one may hop — two arcs at
 * the same point cancel each other out visually. The element id breaks the
 * tie: it is stable, and both sides reach the same verdict without sharing
 * any state.
 */
const crossableRoutes = (self: BoardElement, scene: BoardScene): Point[][] => {
  const routes: Point[][] = [];
  for (const el of Object.values(scene)) {
    if (el.id === self.id || el.type !== 'connector') {
      continue;
    }
    const c = el.connector ?? {};
    if (c.jumps && el.id < self.id) {
      continue;
    }
    const { start, end } = resolveConnectorEndpoints(el, scene);
    routes.push(
      connectorWaypoints(
        c.routing ?? 'straight',
        start,
        end,
        connectorBendPoints(c.bends, c.bend),
        c.fromAnchor ? anchorSide(c.fromAnchor) : undefined
      )
    );
  }
  return routes;
};

/** One arrowhead: a disc, a filled shape, or two open strokes. */
const ArrowHeadMark = ({
  shape,
  color,
}: {
  shape: ArrowHeadShape | null;
  color: string;
}) => {
  if (!shape) {
    return null;
  }
  if (shape.circle) {
    return (
      <circle
        cx={shape.circle.c.x}
        cy={shape.circle.c.y}
        r={shape.circle.r}
        fill={color}
      />
    );
  }
  if (!shape.filled) {
    return (
      <polyline
        points={pointsToSvg(shape.points)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  return <polygon points={pointsToSvg(shape.points)} fill={color} />;
};

/** The chip in an element's top-right corner. */
const BadgeChip = ({ element }: { element: BoardElement }) => {
  const badge = element.badge?.trim();
  if (!badge) {
    return null;
  }
  const w = Math.max(22, badge.length * 7 + 10);
  const h = 18;
  // Overlapping the corner rather than sitting inside it, so it does not eat
  // into the element's own text on a small card.
  const x = element.x + element.w - w + 4;
  const y = element.y - 6;
  return (
    <g style={{ userSelect: 'none' }} pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx={9} fill="#1f2937" />
      <text
        x={x + w / 2}
        y={y + 13}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="#ffffff"
        fontFamily={SANS_FAMILY}
      >
        {badge}
      </text>
    </g>
  );
};

const POLL_ROW_H = 30;
const POLL_HEAD_H = 34;

/**
 * A poll: the question, then a row per option.
 *
 * Each row carries `data-poll-option`, which the board's pointer handler
 * looks for BEFORE it starts a drag — otherwise voting would be impossible,
 * since a click on an element is how you begin to move it.
 */
const BoardPollView = ({
  element,
  opacity,
  currentUserId,
}: {
  element: BoardElement;
  opacity: number;
  currentUserId?: string;
}) => {
  const poll = element.poll;
  const options = poll?.options ?? [];
  const { counts, voters, max } = tallyPoll(element);
  const mine = currentUserId ? (poll?.votes?.[currentUserId] ?? []) : [];
  const revealed = poll?.revealed ?? false;

  return (
    <g opacity={opacity} style={{ userSelect: 'none' }}>
      <rect
        x={element.x}
        y={element.y}
        width={element.w}
        height={element.h}
        rx={10}
        fill={element.style.fill ?? '#ffffff'}
        stroke={element.style.stroke ?? '#334155'}
        strokeWidth={element.style.strokeWidth ?? 2}
      />

      <text
        x={element.x + 12}
        y={element.y + 22}
        fontSize={14}
        fontWeight={600}
        fill={element.style.color ?? '#1f2937'}
        fontFamily={SANS_FAMILY}
      >
        {element.text || 'Question?'}
      </text>

      {options.map((option, i) => {
        const y = element.y + POLL_HEAD_H + i * POLL_ROW_H;
        const count = counts[i] ?? 0;
        const chosen = mine.includes(i);
        const barW = revealed
          ? Math.max(0, (element.w - 24) * (count / max))
          : 0;
        return (
          <g key={i} data-poll-option={i} style={{ cursor: 'pointer' }}>
            {/* The bar sits UNDER the label so a long option stays readable
                against it. */}
            <rect
              x={element.x + 12}
              y={y}
              width={element.w - 24}
              height={POLL_ROW_H - 6}
              rx={6}
              fill={chosen ? '#dbeafe' : '#f1f5f9'}
              stroke={chosen ? '#3b82f6' : 'transparent'}
              strokeWidth={1.5}
            />
            {revealed && barW > 0 && (
              <rect
                x={element.x + 12}
                y={y}
                width={barW}
                height={POLL_ROW_H - 6}
                rx={6}
                fill="#bfdbfe"
              />
            )}
            <text
              x={element.x + 20}
              y={y + 16}
              fontSize={12}
              fill="#1f2937"
              fontFamily={SANS_FAMILY}
            >
              {option}
            </text>
            {revealed && (
              <text
                x={element.x + element.w - 20}
                y={y + 16}
                textAnchor="end"
                fontSize={12}
                fontWeight={600}
                fill="#475569"
                fontFamily={SANS_FAMILY}
              >
                {count}
              </text>
            )}
          </g>
        );
      })}

      <text
        x={element.x + 12}
        y={element.y + element.h - 8}
        fontSize={11}
        fill="#64748b"
        fontFamily={SANS_FAMILY}
      >
        {revealed
          ? `${voters} ${voters === 1 ? 'vote' : 'votes'}`
          : `${voters} in — hidden until revealed`}
      </text>
    </g>
  );
};

export const BoardElementView = ({
  element,
  scene,
  editing = false,
  canEdit,
  currentUserId,
}: BoardElementViewProps) => {
  const { style } = element;
  const stroke = style.stroke ?? 'none';
  const strokeWidth = style.strokeWidth ?? 0;
  const fill = style.fill ?? 'none';
  const opacity = style.opacity ?? 1;
  const dash = dashArray(style);
  const showText = !editing;

  if (element.type === 'connector') {
    const { start, end } = resolveConnectorEndpoints(element, scene);
    const c = element.connector ?? {};
    const routing = c.routing ?? 'straight';
    const bends = connectorBendPoints(c.bends, c.bend);
    const anchored =
      routing !== 'elbow' &&
      bends.length === 0 &&
      (c.fromAnchor != null || c.toAnchor != null);

    let d: string;
    let headFrom: Point;
    let tailFrom: Point;
    let mid: Point;
    if (anchored) {
      const { c1, c2 } = anchoredCurveControls(
        start,
        end,
        c.fromAnchor ? anchorSide(c.fromAnchor) : undefined,
        c.toAnchor ? anchorSide(c.toAnchor) : undefined
      );
      d =
        'M ' + start.x + ' ' + start.y + ' C ' + c1.x + ' ' + c1.y + ' ' +
        c2.x + ' ' + c2.y + ' ' + end.x + ' ' + end.y;
      headFrom = c2;
      tailFrom = c1;
      mid = cubicPoint(start, c1, c2, end, 0.5);
    } else {
      // The anchored side decides which way the line leaves the shape, so an
      // arrow attached low on a right edge goes out to the right instead of
      // cutting back across the shape.
      const exitSide = c.fromAnchor ? anchorSide(c.fromAnchor) : undefined;
      const wpts = connectorWaypoints(routing, start, end, bends, exitSide);
      d = buildConnectorPath(
        routing,
        start,
        end,
        bends,
        exitSide,
        c.jumps
          ? polylineCrossings(wpts, crossableRoutes(element, scene))
          : undefined
      );
      headFrom = connectorArrowFrom(routing, start, end, bends);
      tailFrom = wpts[1] ?? end;
      mid = connectorHandlePoint(routing, start, end, bends);
    }
    // A head type of undefined falls back to the old booleans, so every
    // existing connector keeps exactly the head it had.
    const endKind: ArrowHead =
      c.arrowEndType ?? (c.arrowEnd === false ? 'none' : 'triangle');
    const startKind: ArrowHead =
      c.arrowStartType ?? (c.arrowStart ? 'triangle' : 'none');
    const head = arrowHeadShape(endKind, end, headFrom, 13);
    const tail = arrowHeadShape(startKind, start, tailFrom, 13);
    // A named dependency labels itself, unless the user wrote their own text.
    const lineLabel = c.label || (c.kind ? DEPENDENCY_LABEL[c.kind] : '');
    const labelWidth = lineLabel ? Math.max(24, lineLabel.length * 7 + 12) : 0;
    return (
      <g opacity={opacity}>
        <path
          d={d}
          stroke={style.stroke ?? '#334155'}
          strokeWidth={style.strokeWidth ?? 2}
          strokeDasharray={
            // "relates to" is the soft one: dashed unless the user has
            // already chosen a dash style of their own.
            c.kind === 'relatesTo' && !style.strokeStyle ? '7 5' : dash
          }
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ArrowHeadMark shape={head} color={style.stroke ?? '#334155'} />
        <ArrowHeadMark shape={tail} color={style.stroke ?? '#334155'} />
        {lineLabel && (
          <g style={{ userSelect: 'none' }}>
            <rect
              x={mid.x - labelWidth / 2}
              y={mid.y - 17}
              width={labelWidth}
              height={18}
              rx={5}
              fill="#ffffff"
              stroke="#e2e8f0"
              opacity={0.92}
            />
            <text
              x={mid.x}
              y={mid.y - 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={500}
              fill="#475569"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {lineLabel}
            </text>
          </g>
        )}
      </g>
    );
  }

  if (element.type === 'poll') {
    return (
      <BoardPollView
        element={element}
        opacity={opacity}
        currentUserId={currentUserId}
      />
    );
  }

  if (element.type === 'freehand') {
    const pts = (element.points ?? []).map(([x, y]) => ({
      x: x ?? 0,
      y: y ?? 0,
    }));
    if (pts.length === 0) {
      return null;
    }
    return (
      <polyline
        points={pointsToSvg(pts)}
        fill="none"
        stroke={style.stroke ?? '#334155'}
        strokeWidth={style.strokeWidth ?? 3}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={opacity}
      />
    );
  }

  const rotation = element.rotation ?? 0;
  const center = rectCenter(element);
  const transform = rotation
    ? `rotate(${rotation} ${center.x} ${center.y})`
    : undefined;

  // A named outline replaces the element's default one. Only the three drawn
  // shapes take part: a sticky, a frame or a mind-map node has a look that is
  // part of what it IS, not a style choice.
  const customPath =
    element.type === 'rect' ||
    element.type === 'ellipse' ||
    element.type === 'diamond'
      ? boardShapePath(element.shape, {
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        })
      : null;

  let shape: React.ReactNode = null;
  if (customPath) {
    shape = (
      <path
        d={customPath}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinejoin="round"
      />
    );
  }
  switch (customPath ? '__custom' : element.type) {
    case 'sticky':
      shape = (
        <>
          <rect
            x={element.x}
            y={element.y}
            width={element.w}
            height={element.h}
            rx={6}
            fill={fill === 'none' ? '#fff7ae' : fill}
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={1}
          />
        </>
      );
      break;
    case 'rect':
    case 'frame': {
      // Frames default to a translucent slate wash, but honour an explicit fill
      // when the user has picked one. Treat 'none'/'transparent' (the frame's
      // default) as "no real fill" and fall back to the slate constant.
      const frameFill =
        fill === 'none' || fill === 'transparent'
          ? 'rgba(148,163,184,0.04)'
          : fill;
      shape = (
        <rect
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          rx={element.type === 'frame' ? 4 : 8}
          fill={element.type === 'frame' ? frameFill : fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={element.type === 'frame' ? '6 4' : dash}
        />
      );
      break;
    }
    case 'mindmap':
      shape = (
        <rect
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          rx={14}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
      break;
    case 'ellipse':
      shape = (
        <ellipse
          cx={center.x}
          cy={center.y}
          rx={element.w / 2}
          ry={element.h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
        />
      );
      break;
    case 'diamond':
      shape = (
        <polygon
          points={pointsToSvg([
            { x: center.x, y: element.y },
            { x: element.x + element.w, y: center.y },
            { x: center.x, y: element.y + element.h },
            { x: element.x, y: center.y },
          ])}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
        />
      );
      break;
    case 'image':
      shape = <BoardImage element={element} />;
      break;
    case 'nodeCard':
      shape = <BoardNodeCard element={element} canEdit={canEdit} />;
      break;
    case '__custom':
      // Already drawn above. Without this it would fall to `default` and be
      // thrown away — the switch ends by clearing the shape, not keeping it.
      break;
    case 'text':
    default:
      shape = null;
      break;
  }

  return (
    <g transform={transform} opacity={opacity}>
      {shape}
      <BadgeChip element={element} />
      {element.type === 'frame' && element.text && (
        <text
          x={element.x + 4}
          y={element.y - 8}
          fontSize={13}
          fontWeight="600"
          fill="#64748b"
          fontFamily="Inter, system-ui, sans-serif"
          style={{ userSelect: 'none' }}
        >
          {element.text}
        </text>
      )}
      {showText && element.type !== 'frame' && (
        <Label
          element={element}
          align={element.type === 'text' ? 'start' : 'center'}
        />
      )}
    </g>
  );
};
