import { BoardElement, BoardScene } from '@colanode/core';
import { resolveConnectorEndpoints } from '@colanode/ui/lib/board/elements';
import {
  arrowHeadPoints,
  connectorPath,
  pointsToSvg,
  rectCenter,
} from '@colanode/ui/lib/board/geometry';

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
  const centerY = element.y + element.h / 2;
  const startY =
    align === 'center'
      ? centerY - totalHeight / 2 + fontSize
      : element.y + padding + fontSize;
  const anchorX =
    align === 'center' ? element.x + element.w / 2 : element.x + padding;

  return (
    <text
      x={anchorX}
      y={startY}
      fill={color}
      fontSize={fontSize}
      fontWeight={fontWeight}
      textAnchor={align === 'center' ? 'middle' : 'start'}
      fontFamily="Inter, system-ui, sans-serif"
      style={{ userSelect: 'none' }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={anchorX} dy={i === 0 ? 0 : lineHeight}>
          {line.length === 0 ? ' ' : line}
        </tspan>
      ))}
    </text>
  );
};

interface BoardElementViewProps {
  element: BoardElement;
  scene: BoardScene;
  editing?: boolean;
}

export const BoardElementView = ({
  element,
  scene,
  editing = false,
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
    const head = arrowHeadPoints(end, start, 12);
    const tail = arrowHeadPoints(start, end, 12);
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return (
      <g opacity={opacity}>
        <path
          d={connectorPath(start, end)}
          stroke={style.stroke ?? '#334155'}
          strokeWidth={style.strokeWidth ?? 2}
          strokeDasharray={dash}
          fill="none"
          strokeLinecap="round"
        />
        {c.arrowEnd !== false && (
          <polygon
            points={pointsToSvg(head)}
            fill={style.stroke ?? '#334155'}
          />
        )}
        {c.arrowStart && (
          <polygon
            points={pointsToSvg(tail)}
            fill={style.stroke ?? '#334155'}
          />
        )}
        {c.label && (
          <text
            x={mid.x}
            y={mid.y - 6}
            textAnchor="middle"
            fontSize={13}
            fill="#475569"
            fontFamily="Inter, system-ui, sans-serif"
            style={{ userSelect: 'none' }}
          >
            {c.label}
          </text>
        )}
      </g>
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

  let shape: React.ReactNode = null;
  switch (element.type) {
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
    case 'frame':
      shape = (
        <rect
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          rx={element.type === 'frame' ? 4 : 8}
          fill={element.type === 'frame' ? 'rgba(148,163,184,0.04)' : fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={element.type === 'frame' ? '6 4' : dash}
        />
      );
      break;
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
    case 'text':
    default:
      shape = null;
      break;
  }

  return (
    <g transform={transform} opacity={opacity}>
      {shape}
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
