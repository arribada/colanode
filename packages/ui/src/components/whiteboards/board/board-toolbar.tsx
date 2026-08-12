import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Circle,
  Copy,
  Diamond,
  Download,
  FileCode,
  Eraser,
  Eye,
  EyeOff,
  Frame,
  Hand,
  Highlighter,
  Layers,
  LayoutTemplate,
  Lock,
  LockOpen,
  MessageSquare,
  MoreHorizontal,
  MousePointer2,
  Network,
  Paintbrush,
  Pencil,
  Play,
  Printer,
  Redo2,
  Smile,
  Spline,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { EmojiPicker } from '@colanode/ui/components/emojis/emoji-picker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import {
  readCustomColors,
  rememberCustomColor,
} from '@colanode/ui/lib/board/custom-colors';
import {
  FRAME_PRESETS,
  SHAPE_FILLS,
  TEXT_COLORS,
  STICKY_COLORS,
  STROKE_COLORS,
} from '@colanode/ui/lib/board/elements';
import { emojiFromUnified } from '@colanode/ui/lib/board/emoji';
import { BOARD_SHAPES } from '@colanode/ui/lib/board/shapes';
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

const ARROW_HEADS: { value: string; label: string; mark: string }[] = [
  { value: 'none', label: 'No head', mark: '—' },
  { value: 'arrow', label: 'Open arrow', mark: '\u2192' },
  { value: 'triangle', label: 'Filled triangle', mark: '\u25b6' },
  { value: 'circle', label: 'Disc', mark: '\u25cf' },
  { value: 'diamond', label: 'Diamond', mark: '\u25c6' },
];

// Once-a-session actions, in the order they are reached for.
const BOARD_ACTIONS: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'present', label: 'Present the frames', icon: Play },
  { id: 'import', label: 'Import a Miro board', icon: Upload },
  { id: 'png', label: 'Export PNG', icon: Download },
  { id: 'svg', label: 'Export SVG', icon: FileCode },
  { id: 'pdf', label: 'Print / PDF', icon: Printer },
];

const MINDMAP_DIRECTIONS: {
  value: 'right' | 'left' | 'down' | 'up';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'right', label: 'Grow right', icon: ArrowRight },
  { value: 'left', label: 'Grow left', icon: ArrowLeft },
  { value: 'down', label: 'Grow down', icon: ArrowDown },
  { value: 'up', label: 'Grow up', icon: ArrowUp },
];

interface ToolGroup {
  id: string;
  label: string;
  tools: ToolDef[];
}

// Select and pan are half of all tool use; everything else is grouped by what
// it makes, so the row is six buttons instead of fourteen.
const LOOSE_TOOLS: ToolDef[] = [
  { tool: 'select', label: 'Select (V)', icon: MousePointer2 },
  { tool: 'hand', label: 'Pan (H)', icon: Hand },
];

const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'notes',
    label: 'Notes and text',
    tools: [
      { tool: 'sticky', label: 'Sticky note (S)', icon: StickyNote },
      { tool: 'text', label: 'Text (T)', icon: Type },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    tools: [
      { tool: 'rect', label: 'Rectangle (R)', icon: Square },
      { tool: 'ellipse', label: 'Ellipse (O)', icon: Circle },
      { tool: 'diamond', label: 'Diamond (D)', icon: Diamond },
      { tool: 'frame', label: 'Frame (F)', icon: Frame },
    ],
  },
  {
    id: 'connect',
    label: 'Connect',
    tools: [
      { tool: 'connector', label: 'Connector (C)', icon: Spline },
      { tool: 'mindmap', label: 'Mind map (M)', icon: Network },
    ],
  },
  {
    id: 'ink',
    label: 'Ink',
    tools: [
      { tool: 'pen', label: 'Pen (P)', icon: Pencil },
      { tool: 'highlighter', label: 'Highlighter (K)', icon: Highlighter },
      { tool: 'eraser', label: 'Eraser (E)', icon: Eraser },
    ],
  },
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

/** The colours the user mixed, offered in every picker. */
const CustomPalette = ({
  colors,
  active,
  hint,
  onPick,
}: {
  colors: string[];
  active?: string;
  hint?: string;
  onPick: (hex: string) => void;
}) => {
  if (colors.length === 0) {
    return null;
  }
  return (
    <div className="flex items-center gap-1.5 border-t border-border pt-2">
      <span className="text-xs text-muted-foreground">Yours</span>
      {colors.map((color) => (
        <Swatch
          key={color}
          color={color}
          active={active === color}
          onClick={() => onPick(color)}
        />
      ))}
      {hint && (
        <span className="pl-1 text-[10px] text-muted-foreground">{hint}</span>
      )}
    </div>
  );
};

interface StyleGroupProps {
  id: string;
  label: string;
  /** Shown next to the label — the value this category is currently set to. */
  value?: string;
  /** Shown instead of `value` when the setting IS a colour. */
  swatch?: string;
  open: string | null;
  onOpenChange: (id: string | null) => void;
  children: React.ReactNode;
}

/**
 * One category of the style panel: a chip that says what it is set to, and
 * opens its controls on click.
 *
 * Only one category is open at a time — two popovers side by side cover the
 * board and each other.
 */
const StyleGroup = ({
  id,
  label,
  value,
  swatch,
  open,
  onOpenChange,
  children,
}: StyleGroupProps) => (
  <Popover
    open={open === id}
    onOpenChange={(o) => onOpenChange(o ? id : null)}
  >
    <PopoverTrigger asChild>
      <button
        type="button"
        title={label}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-accent',
          open === id && 'bg-accent'
        )}
      >
        <span className="text-muted-foreground">{label}</span>
        {swatch ? (
          <span
            className="size-4 rounded-full border border-border"
            style={{ backgroundColor: swatch }}
          />
        ) : value ? (
          <span className="capitalize">{value}</span>
        ) : null}
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-2" align="start">
      {children}
    </PopoverContent>
  </Popover>
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
  // True when every selected element is a drawn shape, so the outline picker
  // only appears where it would do something.
  selectionIsShapes: boolean;
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
  // Arrowheads of the first selected connector; the setter writes both ends on
  // every selected connector. `reverse` swaps them, which is the common case
  // when a line was drawn the wrong way round.
  connectorArrows: { start: boolean; end: boolean };
  onConnectorArrows: (arrows: { start: boolean; end: boolean }) => void;
  connectorJumps: boolean;
  onConnectorJumps: (jumps: boolean) => void;
  connectorHeads: { start: string; end: string };
  onConnectorHeads: (heads: { start: string; end: string }) => void;
  // Direction of the selected mind map, or null when none is selected.
  mindmapDirection: 'right' | 'left' | 'down' | 'up' | null;
  onMindmapDirection: (direction: 'right' | 'left' | 'down' | 'up') => void;
  // Drops a correctly proportioned frame in the middle of the view.
  onFramePreset: (preset: { w: number; h: number; label: string }) => void;
  onMiroImport: () => void;
  onPresent: () => void;
  onEmoji: (character: string) => void;
  styleBrushActive: boolean;
  onStyleBrush: () => void;
  layersOpen: boolean;
  onToggleLayers: () => void;
  privateMode: boolean;
  onPrivateMode: () => void;
  privateCount: number;
  onRevealPrivate: () => void;
  // Named outline for the selection, or for the next shape drawn when nothing
  // is selected. null clears it back to the plain rectangle.
  shapeName: string | null;
  onShapePick: (shape: string | null) => void;
}

export const BoardToolbar = ({
  tool,
  onToolChange,
  style,
  onStyleChange,
  hasSelection,
  selectionLocked,
  selectionIsShapes,
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
  connectorArrows,
  onConnectorArrows,
  connectorJumps,
  onConnectorJumps,
  connectorHeads,
  onConnectorHeads,
  mindmapDirection,
  onMindmapDirection,
  onFramePreset,
  onMiroImport,
  onPresent,
  onEmoji,
  styleBrushActive,
  onStyleBrush,
  layersOpen,
  onToggleLayers,
  privateMode,
  onPrivateMode,
  privateCount,
  onRevealPrivate,
  shapeName,
  onShapePick,
}: BoardToolbarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  // Once-a-session actions live behind one button so the drawing tools, which
  // are what anyone actually reaches for, stay in the hot path.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openStyleGroup, setOpenStyleGroup] = useState<string | null>(
    null
  );
  // The user's own colours, shown in every colour picker. Read once and kept
  // in state so picking one updates all three pickers at the same time.
  const [customColors, setCustomColors] = useState<string[]>(() =>
    readCustomColors()
  );
  const keepColor = (hex: string) => setCustomColors(rememberCustomColor(hex));
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [boardMenu, setBoardMenu] = useState(false);
  const boardMenuWrapRef = useRef<HTMLDivElement>(null);
  const [boardMenuPos, setBoardMenuPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const toggleBoardMenu = () => {
    if (!boardMenu) {
      const r = boardMenuWrapRef.current?.getBoundingClientRect();
      if (r) {
        setBoardMenuPos({ left: r.left, top: r.bottom + 6 });
      }
    }
    setBoardMenu((open) => !open);
  };

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
      [
        'sticky',
        'rect',
        'ellipse',
        'diamond',
        'text',
        'connector',
        'pen',
        'highlighter',
        'mindmap',
      ].includes(tool));

  const isStickyContext = tool === 'sticky';
  const isFrameContext = tool === 'frame';
  // Shown while a drawing tool is armed, or when the selection is drawn
  // shapes — the only elements a named outline applies to.
  const shapeContextVisible =
    ['rect', 'ellipse', 'diamond'].includes(tool) || shapeName !== null
      ? true
      : selectionIsShapes;
  const fills = isStickyContext ? STICKY_COLORS : SHAPE_FILLS;
  const activeFill = isStickyContext ? style.stickyColor : style.fill;

  if (readOnly) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2 px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen} modal={true}>
          <PopoverTrigger aria-label="Add an emoji" title="Add an emoji">
            <span className="flex size-8 items-center justify-center rounded-md hover:bg-accent">
              <Smile className="size-4" />
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-max p-0" align="start">
            <EmojiPicker
              onPick={(emoji, skinTone) => {
                const unified =
                  emoji.skins[skinTone]?.unified ?? emoji.skins[0]?.unified;
                if (!unified) {
                  return;
                }
                onEmoji(emojiFromUnified(unified));
                setEmojiOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <div className="relative" ref={boardMenuWrapRef}>
          <ToolbarButton
            title="Board actions"
            active={boardMenu}
            onClick={toggleBoardMenu}
          >
            <MoreHorizontal className="size-4" />
          </ToolbarButton>
          {boardMenu &&
            boardMenuPos &&
            createPortal(
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-[60] cursor-default"
                  onClick={() => setBoardMenu(false)}
                />
                <div
                  className="fixed z-[61] w-64 rounded-lg border border-border bg-background p-1 shadow-xl"
                  style={{ left: boardMenuPos.left, top: boardMenuPos.top }}
                >
                  {BOARD_ACTIONS.map((action) => {
                    const handlers: Record<string, () => void> = {
                      present: onPresent,
                      import: onMiroImport,
                      png: onExport,
                      svg: onExportSvg,
                      pdf: onExportPdf,
                    };
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => {
                          setBoardMenu(false);
                          handlers[action.id]?.();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <action.icon className="size-4 text-muted-foreground" />
                        {action.label}
                      </button>
                    );
                  })}

                  <div className="my-1 h-px bg-border" />

                  <button
                    type="button"
                    onClick={() => {
                      setBoardMenu(false);
                      onPrivateMode();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    {privateMode ? (
                      <EyeOff className="size-4 text-primary" />
                    ) : (
                      <Eye className="size-4 text-muted-foreground" />
                    )}
                    <span className="flex-1">
                      {privateMode ? 'Private mode is on' : 'Private mode'}
                    </span>
                  </button>
                  <p className="px-2 pb-1.5 text-[11px] leading-tight text-muted-foreground">
                    Hides what you add from other people until you reveal it.
                    It is not a secret — the elements still reach their
                    computers, which simply do not draw them.
                  </p>
                </div>
              </>,
              boardPortalTarget()
            )}
        </div>

        {privateCount > 0 && (
          <button
            type="button"
            title="Make your hidden elements visible to everyone"
            onClick={onRevealPrivate}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-primary hover:bg-accent"
          >
            Reveal {privateCount}
          </button>
        )}

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
            {/* Select and pan stay out in the open — they are half of all
                tool use and hiding them behind a menu would cost a click
                every time you stop drawing. */}
            {LOOSE_TOOLS.map((t) => (
              <ToolbarButton
                key={t.tool}
                title={t.label}
                active={tool === t.tool}
                onClick={() => onToolChange(t.tool)}
              >
                <t.icon className="size-4" />
              </ToolbarButton>
            ))}

            {TOOL_GROUPS.map((group) => {
              // The group shows the tool you last picked from it, so the row
              // still tells you what is armed without opening anything.
              const activeInGroup = group.tools.find((t) => t.tool === tool);
              const shown = activeInGroup ?? group.tools[0]!;
              return (
                <Popover
                  key={group.id}
                  open={openGroup === group.id}
                  onOpenChange={(o) => setOpenGroup(o ? group.id : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={group.label}
                      aria-label={group.label}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-md hover:bg-accent',
                        activeInGroup && 'bg-primary/10 text-primary'
                      )}
                      onClick={(e) => {
                        // A plain click arms the group's current tool; the
                        // chevron area opens the list. Keeps one click for the
                        // common case and two only when switching.
                        if (!activeInGroup) {
                          e.preventDefault();
                          onToolChange(shown.tool);
                        }
                      }}
                    >
                      <shown.icon className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-1" align="start">
                    <div className="flex items-center gap-0.5">
                      {group.tools.map((t) => (
                        <button
                          key={t.tool}
                          type="button"
                          title={t.label}
                          aria-label={t.label}
                          onClick={() => {
                            onToolChange(t.tool);
                            setOpenGroup(null);
                          }}
                          className={cn(
                            'flex size-8 items-center justify-center rounded-md hover:bg-accent',
                            tool === t.tool && 'bg-primary/10 text-primary'
                          )}
                        >
                          <t.icon className="size-4" />
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}

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
            <ToolbarButton
              title="Layers"
              active={layersOpen}
              onClick={onToggleLayers}
            >
              <Layers className="size-4" />
            </ToolbarButton>

            <ToolbarButton
              title={
                styleBrushActive
                  ? 'Style picked up — click elements to paint them (Esc to stop)'
                  : 'Copy the style of the selected element'
              }
              active={styleBrushActive}
              onClick={onStyleBrush}
            >
              <Paintbrush className="size-4" />
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
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="fixed inset-0 z-[60] cursor-default"
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
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur">
          {/* Every category is a chip that says what it is currently set to,
              and opens its choices on click. The panel used to lay all of them
              out at once — three rows of swatches and buttons across the whole
              screen, most of them irrelevant to what was selected. */}

          {connectorContext && (
            <StyleGroup
              id="line"
              label="Line"
              value={connectorRouting}
              open={openStyleGroup}
              onOpenChange={setOpenStyleGroup}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1">
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

                <div className="flex items-center gap-1">
                  <span className="pr-1 text-xs text-muted-foreground">
                    Arrows
                  </span>
                  <button
                    type="button"
                    aria-label="Arrowhead at start"
                    title="Arrowhead at start"
                    onClick={() =>
                      onConnectorArrows({
                        start: !connectorArrows.start,
                        end: connectorArrows.end,
                      })
                    }
                    className={cn(
                      'rounded-md px-2 py-1 text-xs hover:bg-accent',
                      connectorArrows.start && 'bg-primary/10 text-primary'
                    )}
                  >
                    &larr;
                  </button>
                  <button
                    type="button"
                    aria-label="Arrowhead at end"
                    title="Arrowhead at end"
                    onClick={() =>
                      onConnectorArrows({
                        start: connectorArrows.start,
                        end: !connectorArrows.end,
                      })
                    }
                    className={cn(
                      'rounded-md px-2 py-1 text-xs hover:bg-accent',
                      connectorArrows.end && 'bg-primary/10 text-primary'
                    )}
                  >
                    &rarr;
                  </button>
                  <button
                    type="button"
                    aria-label="Reverse direction"
                    title="Reverse direction"
                    onClick={() =>
                      onConnectorArrows({
                        start: connectorArrows.end,
                        end: connectorArrows.start,
                      })
                    }
                    className="rounded-md px-2 py-1 text-xs hover:bg-accent"
                  >
                    &#8646;
                  </button>
                  <button
                    type="button"
                    aria-label="Line jumps"
                    title="Hop over crossing lines"
                    onClick={() => onConnectorJumps(!connectorJumps)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs hover:bg-accent',
                      connectorJumps && 'bg-primary/10 text-primary'
                    )}
                  >
                    &#8901;&#8255;&#8901;
                  </button>
                </div>

                {/* Each end's head is chosen separately, so a line can be
                    plain at one end and pointed at the other, or pointed at
                    both. */}
                {(
                  [
                    ['start', 'Start'],
                    ['end', 'End'],
                  ] as const
                ).map(([which, label]) => (
                  <div key={which} className="flex items-center gap-1">
                    <span className="w-10 text-xs text-muted-foreground">
                      {label}
                    </span>
                    {ARROW_HEADS.map((head) => (
                      <button
                        key={head.value}
                        type="button"
                        title={head.label}
                        onClick={() =>
                          onConnectorHeads({
                            ...connectorHeads,
                            [which]: head.value,
                          })
                        }
                        className={cn(
                          'rounded-md px-2 py-1 text-xs hover:bg-accent',
                          connectorHeads[which] === head.value &&
                            'bg-primary/10 text-primary'
                        )}
                      >
                        {head.mark}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </StyleGroup>
          )}

          {shapeContextVisible && (
            <StyleGroup
              id="shape"
              label="Shape"
              value={
                shapeName
                  ? (BOARD_SHAPES.find((d) => d.id === shapeName)?.label ??
                    shapeName)
                  : 'Plain'
              }
              open={openStyleGroup}
              onOpenChange={setOpenStyleGroup}
            >
              <div className="grid max-w-[280px] grid-cols-8 gap-0.5">
                <button
                  type="button"
                  title="Plain"
                  onClick={() => onShapePick(null)}
                  className={cn(
                    'rounded-md p-1 hover:bg-accent',
                    !shapeName && 'bg-primary/10 text-primary'
                  )}
                >
                  <svg viewBox="0 0 24 24" className="size-4">
                    <rect
                      x="3"
                      y="6"
                      width="18"
                      height="12"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
                {BOARD_SHAPES.map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    title={def.label}
                    onClick={() => onShapePick(def.id)}
                    className={cn(
                      'rounded-md p-1 hover:bg-accent',
                      shapeName === def.id && 'bg-primary/10 text-primary'
                    )}
                  >
                    <svg viewBox="0 0 24 24" className="size-4">
                      <path
                        d={def.path({ x: 3, y: 4, w: 18, h: 16 })}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </StyleGroup>
          )}

          {isFrameContext && (
            <StyleGroup
              id="frame"
              label="Frame"
              value="size"
              open={openStyleGroup}
              onOpenChange={setOpenStyleGroup}
            >
              <div className="flex flex-col gap-1">
                {FRAME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onFramePreset(preset)}
                    className="flex items-center justify-between gap-4 rounded-md px-2 py-1 text-xs hover:bg-accent"
                  >
                    <span>{preset.label}</span>
                    <span className="text-muted-foreground">
                      {preset.w}&times;{preset.h}
                    </span>
                  </button>
                ))}
                <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                  or drag one out on the board
                </p>
              </div>
            </StyleGroup>
          )}

          {mindmapDirection && (
            <StyleGroup
              id="grow"
              label="Grow"
              value={mindmapDirection}
              open={openStyleGroup}
              onOpenChange={setOpenStyleGroup}
            >
              <div className="flex items-center gap-1">
                {MINDMAP_DIRECTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    aria-label={d.label}
                    title={d.label}
                    onClick={() => onMindmapDirection(d.value)}
                    className={cn(
                      'rounded-md p-1.5 hover:bg-accent',
                      mindmapDirection === d.value &&
                        'bg-primary/10 text-primary'
                    )}
                  >
                    <d.icon className="size-4" />
                  </button>
                ))}
              </div>
            </StyleGroup>
          )}

          <StyleGroup
            id="fill"
            label={isStickyContext ? 'Note' : 'Fill'}
            swatch={activeFill}
            open={openStyleGroup}
            onOpenChange={setOpenStyleGroup}
          >
            <div className="flex items-center gap-1.5">
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
                title={
                  isStickyContext ? 'Custom note color' : 'Custom fill color'
                }
                value={asHexColor(activeFill, '#ffffff')}
                onChange={(hex) => {
                  keepColor(hex);
                  onStyleChange(
                    isStickyContext ? { stickyColor: hex } : { fill: hex }
                  );
                }}
              />
            </div>

            <CustomPalette
              colors={customColors}
              active={activeFill}
              hint="1 – 8"
              onPick={(hex) =>
                onStyleChange(
                  isStickyContext ? { stickyColor: hex } : { fill: hex }
                )
              }
            />
          </StyleGroup>

          <StyleGroup
            id="text"
            label="Text"
            swatch={style.textColor}
            open={openStyleGroup}
            onOpenChange={setOpenStyleGroup}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                {TEXT_COLORS.map((color) => (
                  <Swatch
                    key={color}
                    color={color}
                    active={style.textColor === color}
                    onClick={() => onStyleChange({ textColor: color })}
                  />
                ))}
                <ColorInput
                  title="Custom text color"
                  value={asHexColor(style.textColor, '#1f2937')}
                  onChange={(hex) => {
                    keepColor(hex);
                    onStyleChange({ textColor: hex });
                  }}
                />
              </div>

              <CustomPalette
                colors={customColors}
                active={style.textColor}
                onPick={(hex) => onStyleChange({ textColor: hex })}
              />

              <div className="flex items-center gap-1">
                <span className="pr-1 text-xs text-muted-foreground">
                  Align
                </span>
                {(
                  [
                    ['left', 'Left'],
                    ['center', 'Centre'],
                    ['right', 'Right'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    title={label}
                    onClick={() => onStyleChange({ textAlign: value })}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs hover:bg-accent',
                      style.textAlign === value && 'bg-primary/10 text-primary'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="pr-1 text-xs text-muted-foreground">
                  Vertical
                </span>
                {(
                  [
                    ['top', 'Top'],
                    ['middle', 'Middle'],
                    ['bottom', 'Bottom'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    title={label}
                    onClick={() => onStyleChange({ verticalAlign: value })}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs hover:bg-accent',
                      style.verticalAlign === value &&
                        'bg-primary/10 text-primary'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="pr-1 text-xs text-muted-foreground">Face</span>
                {(
                  [
                    ['sans', 'Normal'],
                    ['mono', 'Code'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    title={
                      value === 'mono'
                        ? 'Monospace, with the spacing kept — for code'
                        : 'The board\u2019s normal face'
                    }
                    onClick={() => onStyleChange({ fontFamily: value })}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs hover:bg-accent',
                      style.fontFamily === value && 'bg-primary/10 text-primary',
                      value === 'mono' && 'font-mono'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {fontControlsVisible && (
                <div className="flex items-center gap-1">
                  <span className="pr-1 text-xs text-muted-foreground">
                    Size
                  </span>
                  <button
                    type="button"
                    aria-label="Decrease font size"
                    title="Decrease font size"
                    onClick={() => onFontDelta(-2)}
                    className="rounded-md px-2 py-1 text-xs hover:bg-accent"
                  >
                    A-
                  </button>
                  <span className="min-w-6 text-center text-xs tabular-nums text-muted-foreground">
                    {fontSize}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase font size"
                    title="Increase font size"
                    onClick={() => onFontDelta(2)}
                    className="rounded-md px-2 py-1 text-xs hover:bg-accent"
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    aria-label="Auto-fit font size"
                    title="Fit the text to the shape"
                    onClick={() => onFontAuto(!fontAuto)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs hover:bg-accent',
                      fontAuto && 'bg-primary/10 text-primary'
                    )}
                  >
                    Auto
                  </button>
                </div>
              )}
            </div>
          </StyleGroup>

          <StyleGroup
            id="stroke"
            label="Stroke"
            swatch={style.stroke}
            open={openStyleGroup}
            onOpenChange={setOpenStyleGroup}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
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
                  onChange={(hex) => {
                    keepColor(hex);
                    onStyleChange({ stroke: hex });
                  }}
                />
              </div>

              <CustomPalette
                colors={customColors}
                active={style.stroke}
                hint="Shift + 1 – 8"
                onPick={(hex) => onStyleChange({ stroke: hex })}
              />

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
                <div className="mx-1 h-5 w-px bg-border" />
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

              <div className="flex items-center gap-2">
                {/* The four presets cover most lines; this is for the ones
                    they do not. */}
                <span className="text-xs text-muted-foreground">Exact</span>
                <input
                  type="range"
                  min={1}
                  max={40}
                  step={1}
                  value={style.strokeWidth}
                  aria-label="Stroke width"
                  onChange={(e) =>
                    onStyleChange({ strokeWidth: Number(e.target.value) })
                  }
                  className="h-1.5 w-32 cursor-pointer accent-primary"
                />
                <span className="min-w-8 text-right text-xs tabular-nums text-muted-foreground">
                  {style.strokeWidth}px
                </span>
              </div>
            </div>
          </StyleGroup>

          <StyleGroup
            id="opacity"
            label="Opacity"
            value={`${Math.round(style.opacity * 100)}%`}
            open={openStyleGroup}
            onOpenChange={setOpenStyleGroup}
          >
            <div className="flex items-center gap-2">
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
                className="h-1.5 w-32 cursor-pointer accent-primary"
              />
              <span className="min-w-8 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(style.opacity * 100)}%
              </span>
            </div>
          </StyleGroup>
        </div>
      )}
    </div>
  );
};
