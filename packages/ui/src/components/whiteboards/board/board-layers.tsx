// The layers panel: everything on the board, arranged as a TREE — frames and
// groups at the top level, their members nested beneath, then the loose
// elements that belong to neither. Each row still carries the two controls
// that matter when things overlap (hide / lock) plus stack ordering, and any
// row can be dragged onto a frame or group to re-parent it.
//
// Top-level order reads front-first for the loose elements (the way the stack
// reads on screen), with frames listed in reading order and free groups after
// them — containers first, contents second, which is how a layers tree is
// expected to read.

import { useState } from 'react';

import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Frame as FrameIcon,
  Group as GroupIcon,
  Lock,
  LockOpen,
  SendToBack,
  BringToFront,
} from 'lucide-react';

import { BoardElement, BoardScene } from '@colanode/core';
import {
  frameChildIds,
  frameOrder,
  sortedElements,
} from '@colanode/ui/lib/board/elements';
import { cn } from '@colanode/ui/lib/utils';

interface BoardLayersProps {
  scene: BoardScene;
  selection: string[];
  canEdit: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onReorder: (id: string, toFront: boolean) => void;
  onReparent: (id: string, groupId: string | null, frameId: string | null) => void;
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
    poll: 'Poll',
  };
  return named[el.type] ?? el.type;
};

// A node in the layers tree. Frames and groups are containers with children;
// every other element is a leaf. `groupId` / `frameId` on a leaf record where a
// drop would re-parent it to (a container row targets its own id).
interface TreeNode {
  kind: 'frame' | 'group' | 'leaf';
  id: string;
  label: string;
  el?: BoardElement;
  children: TreeNode[];
}

/**
 * Build the layers tree from the scene:
 *   - one node per frame (frameOrder), holding its contained elements;
 *   - one node per free group (a groupId with no frame membership);
 *   - the remaining loose elements, front-first.
 * An element is claimed by at most one container, frames winning over groups,
 * so nothing is listed twice.
 */
const buildTree = (scene: BoardScene): TreeNode[] => {
  const claimed = new Set<string>();
  const nodes: TreeNode[] = [];

  // Frames first, in reading order.
  for (const frame of frameOrder(scene)) {
    claimed.add(frame.id);
    const childIds = frameChildIds(scene, frame.id).filter(
      (cid) => !claimed.has(cid)
    );
    const children = sortedElements(scene)
      .filter((el) => childIds.includes(el.id))
      .reverse()
      .map((el) => {
        claimed.add(el.id);
        return {
          kind: 'leaf' as const,
          id: el.id,
          label: labelFor(el),
          el,
          children: [],
        };
      });
    nodes.push({
      kind: 'frame',
      id: frame.id,
      label: labelFor(frame),
      el: frame,
      children,
    });
  }

  // Free groups: a groupId whose members are not already inside a frame.
  const groups = new Map<string, BoardElement[]>();
  for (const el of Object.values(scene)) {
    if (!el.groupId || claimed.has(el.id) || el.type === 'frame') {
      continue;
    }
    const arr = groups.get(el.groupId) ?? [];
    arr.push(el);
    groups.set(el.groupId, arr);
  }
  for (const [gid, members] of groups) {
    // A "group" of one is just a loose element with a stale groupId — list it
    // flat rather than as an empty-looking container.
    if (members.length < 2) {
      continue;
    }
    const children = members
      .sort((a, b) => (a.z < b.z ? 1 : a.z > b.z ? -1 : 0))
      .map((el) => {
        claimed.add(el.id);
        return {
          kind: 'leaf' as const,
          id: el.id,
          label: labelFor(el),
          el,
          children: [],
        };
      });
    nodes.push({
      kind: 'group',
      id: gid,
      label: `Group (${members.length})`,
      children,
    });
  }

  // Loose elements, front-first.
  const loose = [...sortedElements(scene)]
    .reverse()
    .filter((el) => !claimed.has(el.id) && el.type !== 'frame');
  for (const el of loose) {
    nodes.push({
      kind: 'leaf',
      id: el.id,
      label: labelFor(el),
      el,
      children: [],
    });
  }

  return nodes;
};

export const BoardLayers = ({
  scene,
  selection,
  canEdit,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onMove,
  onReorder,
  onReparent,
  onClose,
}: BoardLayersProps) => {
  const tree = buildTree(scene);
  const total = Object.keys(scene).length;

  // Containers start expanded so the tree is discoverable; the user can fold
  // any of them away.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const renderRow = (
    node: TreeNode,
    depth: number,
    container: { frameId: string | null; groupId: string | null }
  ) => {
    const el = node.el;
    const selected = selection.includes(node.id);
    const isContainer = node.kind !== 'leaf';
    const open = !collapsed.has(node.id);
    const Icon =
      node.kind === 'frame'
        ? FrameIcon
        : node.kind === 'group'
          ? GroupIcon
          : null;

    return (
      <li key={node.id}>
        <div
          draggable={canEdit && node.kind === 'leaf'}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (!canEdit || !isContainer) {
              return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropTarget(node.id);
          }}
          onDragLeave={() => {
            if (dropTarget === node.id) {
              setDropTarget(null);
            }
          }}
          onDrop={(e) => {
            if (!canEdit || !isContainer) {
              return;
            }
            e.preventDefault();
            const dragged = e.dataTransfer.getData('text/plain');
            setDropTarget(null);
            if (!dragged || dragged === node.id) {
              return;
            }
            if (node.kind === 'frame') {
              onReparent(dragged, null, node.id);
            } else {
              onReparent(dragged, node.id, null);
            }
          }}
          className={cn(
            'group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs',
            selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
            dropTarget === node.id && 'ring-1 ring-primary'
          )}
          style={{ paddingLeft: `${6 + depth * 14}px` }}
        >
          {isContainer ? (
            <button
              type="button"
              aria-label={open ? 'Collapse' : 'Expand'}
              onClick={() => toggleCollapsed(node.id)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="w-[18px]" />
          )}

          {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}

          <button
            type="button"
            onClick={(e) => onSelect(node.id, e.shiftKey)}
            className={cn(
              'flex-1 truncate text-left',
              el?.hidden && 'text-muted-foreground line-through'
            )}
            title={node.label}
          >
            {node.label}
          </button>

          {canEdit && node.kind === 'leaf' && (
            <>
              {/* Re-parent out of the current container, when in one. */}
              {(container.frameId || container.groupId) && (
                <button
                  type="button"
                  aria-label="Move out"
                  title="Move out of frame / group"
                  onClick={() => onReparent(node.id, null, null)}
                  className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  <ChevronUp className="size-3.5 rotate-45" />
                </button>
              )}
              <button
                type="button"
                aria-label="Bring to front"
                title="Bring to front"
                onClick={() => onReorder(node.id, true)}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <BringToFront className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Send to back"
                title="Send to back"
                onClick={() => onReorder(node.id, false)}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <SendToBack className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Bring forward"
                title="Bring forward"
                onClick={() => onMove(node.id, 'up')}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Send backward"
                title="Send backward"
                onClick={() => onMove(node.id, 'down')}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </>
          )}

          {canEdit && el && (
            <>
              <button
                type="button"
                aria-label={el.hidden ? 'Show' : 'Hide'}
                title={el.hidden ? 'Show' : 'Hide'}
                onClick={() => onToggleHidden(node.id)}
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
                onClick={() => onToggleLocked(node.id)}
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
        </div>

        {isContainer && open && node.children.length > 0 && (
          <ul>
            {node.children.map((child) =>
              renderRow(child, depth + 1, {
                frameId: node.kind === 'frame' ? node.id : null,
                groupId: node.kind === 'group' ? node.id : null,
              })
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="pointer-events-auto absolute right-3 top-20 z-30 flex max-h-[60vh] w-72 max-w-[calc(100vw-1.5rem)] flex-col rounded-lg border border-border bg-background/95 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium">
          Layers
          <span className="pl-1.5 text-muted-foreground">{total}</span>
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

      {total === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Nothing on the board yet.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto p-1">
          {tree.map((node) =>
            renderRow(node, 0, { frameId: null, groupId: null })
          )}
        </ul>
      )}
    </div>
  );
};
