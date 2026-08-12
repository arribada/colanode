// The layers panel: everything on the board, front to back, with the two
// controls that matter when things overlap — hide it, or lock it.
//
// Listed front-first, which is the opposite of paint order. That is how the
// stack reads on screen: the thing you click is the thing at the top of the
// list.

import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';

import { BoardElement, BoardScene } from '@colanode/core';
import { sortedElements } from '@colanode/ui/lib/board/elements';
import { cn } from '@colanode/ui/lib/utils';

interface BoardLayersProps {
  scene: BoardScene;
  selection: string[];
  canEdit: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onClose: () => void;
}

/** What to call an element in the list when it carries no text of its own. */
const labelFor = (el: BoardElement): string => {
  const text = el.text?.trim();
  if (text) {
    return text.length > 28 ? `${text.slice(0, 27)}…` : text;
  }
  if (el.type === 'connector') {
    return el.connector?.label?.trim() || 'Connector';
  }
  const named: Record<string, string> = {
    sticky: 'Sticky note',
    rect: 'Rectangle',
    ellipse: 'Ellipse',
    diamond: 'Diamond',
    text: 'Text',
    freehand: 'Ink',
    frame: 'Frame',
    mindmap: 'Mind-map node',
    image: 'Image',
    nodeCard: 'Page card',
  };
  return named[el.type] ?? el.type;
};

export const BoardLayers = ({
  scene,
  selection,
  canEdit,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onMove,
  onClose,
}: BoardLayersProps) => {
  // Front first: the list reads the way the board looks, not the way it is
  // painted.
  const ordered = [...sortedElements(scene)].reverse();

  return (
    <div className="pointer-events-auto absolute right-3 top-20 z-30 flex max-h-[60vh] w-64 flex-col rounded-lg border border-border bg-background/95 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium">
          Layers
          <span className="pl-1.5 text-muted-foreground">
            {ordered.length}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close layers"
          className="rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Nothing on the board yet.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto p-1">
          {ordered.map((el, index) => {
            const selected = selection.includes(el.id);
            return (
              <li
                key={el.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs',
                  selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                )}
              >
                <button
                  type="button"
                  onClick={(e) => onSelect(el.id, e.shiftKey)}
                  className={cn(
                    'flex-1 truncate text-left',
                    el.hidden && 'text-muted-foreground line-through'
                  )}
                  title={labelFor(el)}
                >
                  {labelFor(el)}
                </button>

                {canEdit && (
                  <>
                    {/* Disabled rather than hidden at the ends of the stack:
                        a control that vanishes is a control you go looking
                        for. */}
                    <button
                      type="button"
                      aria-label="Bring forward"
                      title="Bring forward"
                      disabled={index === 0}
                      onClick={() => onMove(el.id, 'up')}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Send backward"
                      title="Send backward"
                      disabled={index === ordered.length - 1}
                      onClick={() => onMove(el.id, 'down')}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={el.hidden ? 'Show' : 'Hide'}
                      title={el.hidden ? 'Show' : 'Hide'}
                      onClick={() => onToggleHidden(el.id)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {el.hidden ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={el.locked ? 'Unlock' : 'Lock'}
                      title={el.locked ? 'Unlock' : 'Lock'}
                      onClick={() => onToggleLocked(el.id)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {el.locked ? (
                        <Lock className="size-3.5" />
                      ) : (
                        <LockOpen className="size-3.5" />
                      )}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
