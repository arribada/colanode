import {
  ChevronDown,
  Circle,
  Copy,
  Diamond,
  Download,
  FileCode,
  Frame,
  Hand,
  LayoutTemplate,
  Lock,
  LockOpen,
  MessageSquare,
  MousePointer2,
  Network,
  Pencil,
  Printer,
  Redo2,
  Spline,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  SHAPE_FILLS,
  STICKY_COLORS,
  STROKE_COLORS,
} from '@colanode/ui/lib/board/elements';
import { BOARD_TEMPLATES } from '@colanode/ui/lib/board/templates';
import { cn } from '@colanode/ui/lib/utils';

import { BoardStyleState, BoardTool, ConnectorRouting } from './board-types';

// Menus opened from board overlays must escape the toolbar's `overflow-x-auto`
// clip and remain visible while the board is in the Fullscreen API. Portaling
// into the current fullscreen element (falling back to <body>) keeps the menu
// inside the fullscreen subtree — content outside it is not painted — while a
// fixed position lets it break out of the scrolling toolbar container.
const boardPortalTarget = (): HTMLElement =>
  (document.fullscreenElement as HTMLElement | null) ?? document.body;

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

// `<input type="color">` only accepts a `#rrggbb` value; named colors,
// 'transparent'/'none' and rgba() strings silently reset it. Fall back to a
// neutral swatch value so the picker still opens on the current-ish color.
const asHexColor = (color: string | undefined, fallback: string): string =>
  color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;

// A minimal free-color picker styled to sit next to the fixed swatches.
const ColorInput = ({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (hex: string) => void;
  title: string;
}) => (
  <input
    type="color"
    aria-label={title}
    title={title}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="size-6 cursor-pointer rounded-full border border-black/10 bg-transparent p-0"
  />
);

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
  // True when every selected element is hard-locked (drives the lock/unlock
  // toggle icon + label).
  selectionLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onComment: () => void;
  commentEnabled: boolean;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onExport: () => void;
  onExportSvg: () => void;
  onExportPdf: () => void;
  onInsertTemplate: (templateId: string) => void;
  // Per-element text sizing controls (shown when a text-bearing shape is
  // selected). `fontAuto`/`fontSize` reflect the current selection.
  fontControlsVisible: boolean;
  fontAuto: boolean;
  fontSize: number;
  onFontDelta: (delta: number) => void;
  onFontAuto: (auto: boolean) => void;
  // Connector routing toggle (shown only when the selection is connector(s)).
  // `connectorRouting` reflects the first selected connector; the setter writes
  // `connector.routing` on every selected connector (not the shared style).
  connectorContext: boolean;
  connectorRouting: ConnectorRouting;
  onConnectorRouting: (routing: ConnectorRouting) => void;
}

export const BoardToolbar = ({
  tool,
  onToolChange,
  style,
  onStyleChange,
  hasSelection,
  selectionLocked,
  canUndo,
  canRedo,
  readOnly,
  onUndo,
  onRedo,
  onDelete,
  onComment,
  commentEnabled,
  onDuplicate,
  onToggleLock,
  onExport,
  onExportSvg,
  onExportPdf,
  onInsertTemplate,
  fontControlsVisible,
  fontAuto,
  fontSize,
  onFontDelta,
  onFontAuto,
  connectorContext,
  connectorRouting,
  onConnectorRouting,
}: BoardToolbarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [templateMenu, setTemplateMenu] = useState(false);
  const templateWrapRef = useRef<HTMLDivElement>(null);
  // Fixed (viewport) coords of the template dropdown, captured from the trigger
  // when the menu opens so the portaled menu anchors under the button.
  const [templatePos, setTemplatePos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  // Templates worth inserting into a live board (skip the empty "Blank").
  const insertableTemplates = BOARD_TEMPLATES.filter((t) => t.id !== 'blank');

  const toggleTemplateMenu = () => {
    if (!templateMenu) {
      const r = templateWrapRef.current?.getBoundingClientRect();
      if (r) {
        setTemplatePos({ left: r.left, top: r.bottom + 6 });
      }
    }
    setTemplateMenu((open) => !open);
  };

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
            <ToolbarButton
              title="Comment on the selection"
              disabled={!commentEnabled}
              onClick={onComment}
            >
              <MessageSquare className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title={
                selectionLocked
                  ? 'Unlock (anyone can unlock)'
                  : 'Lock selection (only you can move / edit it)'
              }
              active={selectionLocked}
              disabled={!hasSelection}
              onClick={onToggleLock}
            >
              {selectionLocked ? (
                <Lock className="size-4" />
              ) : (
                <LockOpen className="size-4" />
              )}
            </ToolbarButton>
            <ToolbarButton title="Export PNG" onClick={onExport}>
              <Download className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Export SVG" onClick={onExportSvg}>
              <FileCode className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Print / PDF" onClick={onExportPdf}>
              <Printer className="size-4" />
            </ToolbarButton>

            <div className="relative" ref={templateWrapRef}>
              <ToolbarButton
                title="Insert template"
                active={templateMenu}
                onClick={toggleTemplateMenu}
              >
                <LayoutTemplate className="size-4" />
              </ToolbarButton>
              {templateMenu &&
                templatePos &&
                createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[60]"
                      onClick={() => setTemplateMenu(false)}
                    />
                    <div
                      className="fixed z-[61] w-56 rounded-lg border border-border bg-background p-1 shadow-xl"
                      style={{ left: templatePos.left, top: templatePos.top }}
                    >
                      <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Insert template
                      </p>
                      {insertableTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onInsertTemplate(t.id);
                            setTemplateMenu(false);
                          }}
                          className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                        >
                          <span className="block text-xs font-medium">
                            {t.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {t.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>,
                  boardPortalTarget()
                )}
            </div>
          </>
        )}
      </div>

      {showStylePanel && !collapsed && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          {connectorContext && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Line</span>
                {(['straight', 'elbow', 'curved'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-label={`${r} connector`}
                    title={`${r} connector`}
                    onClick={() => onConnectorRouting(r)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs capitalize hover:bg-accent',
                      connectorRouting === r && 'bg-primary/10 text-primary'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="h-6 w-px bg-border" />
            </>
          )}

          {fontControlsVisible && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Text</span>
                <button
                  type="button"
                  aria-label="Decrease font size"
                  title="Decrease font size"
                  disabled={fontAuto}
                  onClick={() => onFontDelta(-2)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md hover:bg-accent',
                    fontAuto && 'pointer-events-none opacity-40'
                  )}
                >
                  <span className="text-xs font-semibold">A-</span>
                </button>
                <span className="min-w-6 text-center text-xs tabular-nums text-muted-foreground">
                  {fontAuto ? 'Auto' : Math.round(fontSize)}
                </span>
                <button
                  type="button"
                  aria-label="Increase font size"
                  title="Increase font size"
                  disabled={fontAuto}
                  onClick={() => onFontDelta(2)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md hover:bg-accent',
                    fontAuto && 'pointer-events-none opacity-40'
                  )}
                >
                  <span className="text-sm font-semibold">A+</span>
                </button>
                <button
                  type="button"
                  aria-label="Auto-fit font size"
                  title="Auto-fit font to shape"
                  onClick={() => onFontAuto(!fontAuto)}
                  className={cn(
                    'ml-0.5 rounded-md px-2 py-1 text-xs hover:bg-accent',
                    fontAuto && 'bg-primary/10 text-primary'
                  )}
                >
                  Auto
                </button>
              </div>

              <div className="h-6 w-px bg-border" />
            </>
          )}

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
            <ColorInput
              title={isStickyContext ? 'Custom note color' : 'Custom fill color'}
              value={asHexColor(activeFill, '#ffffff')}
              onChange={(hex) =>
                onStyleChange(
                  isStickyContext ? { stickyColor: hex } : { fill: hex }
                )
              }
            />
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
            <ColorInput
              title="Custom stroke color"
              value={asHexColor(style.stroke, '#334155')}
              onChange={(hex) => onStyleChange({ stroke: hex })}
            />
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

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.opacity}
              aria-label="Opacity"
              title="Opacity"
              onChange={(e) =>
                onStyleChange({ opacity: Number(e.target.value) })
              }
              className="h-1.5 w-24 cursor-pointer accent-primary"
            />
            <span className="min-w-8 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(style.opacity * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
