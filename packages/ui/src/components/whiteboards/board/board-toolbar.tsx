import {
  ChevronDown,
  Circle,
  Copy,
  Diamond,
  Download,
  Frame,
  Hand,
  MousePointer2,
  Network,
  Pencil,
  Redo2,
  Spline,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';

import {
  SHAPE_FILLS,
  STICKY_COLORS,
  STROKE_COLORS,
} from '@colanode/ui/lib/board/elements';
import { cn } from '@colanode/ui/lib/utils';

import { BoardStyleState, BoardTool } from './board-types';

interface ToolDef {
  tool: BoardTool;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: ToolDef[] = [
  { tool: 'select', label: 'Select (V)', icon: MousePointer2 },
  { tool: 'hand', label: 'Pan (H)', icon: Hand },
  { tool: 'sticky', label: 'Sticky note (S)', icon: StickyNote },
  { tool: 'rect', label: 'Rectangle (R)', icon: Square },
  { tool: 'ellipse', label: 'Ellipse (O)', icon: Circle },
  { tool: 'diamond', label: 'Diamond (D)', icon: Diamond },
  { tool: 'text', label: 'Text (T)', icon: Type },
  { tool: 'connector', label: 'Connector (C)', icon: Spline },
  { tool: 'pen', label: 'Pen (P)', icon: Pencil },
  { tool: 'frame', label: 'Frame (F)', icon: Frame },
  { tool: 'mindmap', label: 'Mind map (M)', icon: Network },
];

const STROKE_WIDTHS = [1, 2, 4, 8];

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

const ToolbarButton = ({
  active,
  disabled,
  title,
  onClick,
  children,
}: ToolbarButtonProps) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
      active && 'bg-primary/10 text-primary hover:bg-primary/15',
      disabled && 'pointer-events-none opacity-40'
    )}
  >
    {children}
  </button>
);

const Swatch = ({
  color,
  active,
  onClick,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={`color ${color}`}
    onClick={onClick}
    className={cn(
      'size-6 rounded-full border border-black/10 transition-transform hover:scale-110',
      active && 'ring-2 ring-primary ring-offset-1'
    )}
    style={{
      backgroundColor: color === 'transparent' ? '#ffffff' : color,
      backgroundImage:
        color === 'transparent'
          ? 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)'
          : undefined,
    }}
  />
);

interface BoardToolbarProps {
  tool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
  style: BoardStyleState;
  onStyleChange: (patch: Partial<BoardStyleState>) => void;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
}

export const BoardToolbar = ({
  tool,
  onToolChange,
  style,
  onStyleChange,
  hasSelection,
  canUndo,
  canRedo,
  readOnly,
  onUndo,
  onRedo,
  onDelete,
  onDuplicate,
  onExport,
}: BoardToolbarProps) => {
  const [collapsed, setCollapsed] = useState(false);

  const showStylePanel =
    !readOnly &&
    (hasSelection ||
      ['sticky', 'rect', 'ellipse', 'diamond', 'text', 'connector', 'pen', 'mindmap'].includes(
        tool
      ));

  const isStickyContext = tool === 'sticky';
  const fills = isStickyContext ? STICKY_COLORS : SHAPE_FILLS;
  const activeFill = isStickyContext ? style.stickyColor : style.fill;

  if (readOnly) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2 px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
        <ToolbarButton
          title={collapsed ? 'Show tools' : 'Hide tools'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronDown
            className={cn('size-4 transition-transform', collapsed && '-rotate-90')}
          />
        </ToolbarButton>

        {!collapsed && (
          <>
            {TOOLS.map((t) => (
              <ToolbarButton
                key={t.tool}
                title={t.label}
                active={tool === t.tool}
                onClick={() => onToolChange(t.tool)}
              >
                <t.icon className="size-4" />
              </ToolbarButton>
            ))}

            <div className="mx-1 h-6 w-px bg-border" />

            <ToolbarButton
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Redo (Ctrl+Y)"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Duplicate (Ctrl+D)"
              disabled={!hasSelection}
              onClick={onDuplicate}
            >
              <Copy className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Delete (Del)"
              disabled={!hasSelection}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Export PNG" onClick={onExport}>
              <Download className="size-4" />
            </ToolbarButton>
          </>
        )}
      </div>

      {showStylePanel && !collapsed && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {isStickyContext ? 'Note' : 'Fill'}
            </span>
            {fills.map((color) => (
              <Swatch
                key={color}
                color={color}
                active={activeFill === color}
                onClick={() =>
                  onStyleChange(
                    isStickyContext
                      ? { stickyColor: color }
                      : { fill: color }
                  )
                }
              />
            ))}
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Stroke</span>
            {STROKE_COLORS.map((color) => (
              <Swatch
                key={color}
                color={color}
                active={style.stroke === color}
                onClick={() => onStyleChange({ stroke: color })}
              />
            ))}
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-1">
            {STROKE_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`stroke width ${w}`}
                onClick={() => onStyleChange({ strokeWidth: w })}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md hover:bg-accent',
                  style.strokeWidth === w && 'bg-primary/10'
                )}
              >
                <span
                  className="rounded-full bg-foreground"
                  style={{ width: 16, height: Math.min(w, 6) }}
                />
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-1">
            {(['solid', 'dashed', 'dotted'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStyleChange({ strokeStyle: s })}
                className={cn(
                  'rounded-md px-2 py-1 text-xs capitalize hover:bg-accent',
                  style.strokeStyle === s && 'bg-primary/10 text-primary'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
