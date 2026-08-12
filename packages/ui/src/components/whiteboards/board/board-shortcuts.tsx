// Whiteboard keyboard shortcuts: the single list the in-app palette and the
// wiki help page both read from, so a key can never be documented as one thing
// and bound to another.

import { useEffect } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';

export interface BoardShortcut {
  /** Alternative ways to trigger it; each combo is keys pressed together. */
  combos: string[][];
  label: string;
}

export interface BoardShortcutGroup {
  title: string;
  items: BoardShortcut[];
}

// The modifier is written "Ctrl" everywhere: the board reads
// `metaKey || ctrlKey`, so the same binding works on a Mac without a second
// list to keep in sync.
export const BOARD_SHORTCUTS: BoardShortcutGroup[] = [
  {
    title: 'Tools',
    items: [
      { combos: [['V']], label: 'Select' },
      { combos: [['H'], ['Space']], label: 'Pan the board' },
      { combos: [['S'], ['N']], label: 'Sticky note' },
      { combos: [['T']], label: 'Text' },
      { combos: [['R']], label: 'Rectangle' },
      { combos: [['O']], label: 'Ellipse' },
      { combos: [['D']], label: 'Diamond' },
      { combos: [['C'], ['L']], label: 'Connector' },
      { combos: [['P']], label: 'Pen' },
      { combos: [['K']], label: 'Highlighter' },
      { combos: [['E']], label: 'Eraser — removes a whole stroke' },
      { combos: [['F']], label: 'Frame' },
      { combos: [['M']], label: 'Mind map' },
    ],
  },
  {
    title: 'Editing',
    items: [
      { combos: [['Ctrl', 'Z']], label: 'Undo' },
      { combos: [['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']], label: 'Redo' },
      { combos: [['Ctrl', 'C']], label: 'Copy' },
      { combos: [['Ctrl', 'X']], label: 'Cut' },
      { combos: [['Ctrl', 'V']], label: 'Paste' },
      { combos: [['Ctrl', 'D']], label: 'Duplicate the selection' },
      { combos: [['Delete'], ['Backspace']], label: 'Delete the selection' },
      { combos: [['Ctrl', 'A']], label: 'Select everything' },
      { combos: [['Esc']], label: 'Deselect / stop editing' },
    ],
  },
  {
    title: 'Arrange',
    items: [
      { combos: [['Ctrl', 'G']], label: 'Group' },
      { combos: [['Ctrl', 'Shift', 'G']], label: 'Ungroup' },
      { combos: [['Ctrl', ']']], label: 'Bring to front' },
      { combos: [['Ctrl', '[']], label: 'Send to back' },
      { combos: [['↑'], ['↓'], ['←'], ['→']], label: 'Nudge by one point' },
      { combos: [['Shift', '↑ ↓ ← →']], label: 'Nudge by one grid step' },
    ],
  },
  {
    title: 'Mind map',
    items: [
      { combos: [['Tab']], label: 'Add a child to the selected node' },
      { combos: [['Enter']], label: 'Add a sibling' },
      { combos: [['Drag']], label: 'Drop a node on another to re-parent it' },
    ],
  },
  {
    title: 'Presentation',
    items: [
      { combos: [['Space'], ['→'], ['PgDn']], label: 'Next frame' },
      { combos: [['←'], ['PgUp']], label: 'Previous frame' },
      { combos: [['Esc']], label: 'Leave the presentation' },
    ],
  },
  {
    title: 'View',
    items: [
      { combos: [['Ctrl', '0']], label: 'Zoom to 100%' },
      { combos: [['Ctrl', '1']], label: 'Fit everything on screen' },
      { combos: [['Ctrl', '+']], label: 'Zoom in' },
      { combos: [['Ctrl', '-']], label: 'Zoom out' },
      { combos: [['Ctrl', 'wheel']], label: 'Zoom to the pointer' },
      { combos: [['?']], label: 'This list' },
    ],
  },
];

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
    {children}
  </kbd>
);

const Combos = ({ combos }: { combos: string[][] }) => (
  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
    {combos.map((combo, ci) => (
      <span key={ci} className="flex items-center gap-1">
        {ci > 0 && (
          <span className="px-0.5 text-[10px] text-muted-foreground">or</span>
        )}
        {combo.map((key, ki) => (
          <span key={key} className="flex items-center gap-1">
            {ki > 0 && (
              <span className="text-[10px] text-muted-foreground">+</span>
            )}
            <Key>{key}</Key>
          </span>
        ))}
      </span>
    ))}
  </span>
);

interface BoardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BoardShortcutsDialog = ({
  open,
  onOpenChange,
}: BoardShortcutsDialogProps) => {
  // The board listens on `window`, so without this the palette's own "?" would
  // toggle it again underneath and Escape would race the board's deselect.
  useEffect(() => {
    if (!open) {
      return;
    }
    const stop = (e: KeyboardEvent) => {
      if (e.key === '?' || e.key === 'Escape') {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', stop, true);
    return () => window.removeEventListener('keydown', stop, true);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Key>?</Key> at any time to bring this list back.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {BOARD_SHORTCUTS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-foreground">{item.label}</span>
                    <Combos combos={item.combos} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
