import {
  Circle,
  Diamond,
  Expand,
  Eye,
  Maximize,
  MessageSquare,
  Minus,
  Plus,
  Radio,
  Shrink,
  Smile,
  Square,
  StickyNote,
  X,
} from 'lucide-react';
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';

import { LocalNode } from '@colanode/client/types';
import {
  BoardElement,
  BoardElementStyle,
  BoardElementType,
  BoardScene,
  extractBlocksMentions,
  hasNodeRole,
  NodeRole,
  PresencePayload,
} from '@colanode/core';
import { PresenceAvatars } from '@colanode/ui/components/presence/presence-avatars';
import { BoardElementView } from '@colanode/ui/components/whiteboards/board/board-element';
import { BoardPresenceLayer } from '@colanode/ui/components/whiteboards/board/board-presence-layer';
import { BoardCommentsPanel } from '@colanode/ui/components/whiteboards/board/board-comments-panel';
import { BoardToolbar } from '@colanode/ui/components/whiteboards/board/board-toolbar';
import {
  BoardStyleState,
  BoardTool,
  ConnectorRouting,
  DEFAULT_BOARD_STYLE,
} from '@colanode/ui/components/whiteboards/board/board-types';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  usePresences,
  usePresencePublisher,
} from '@colanode/ui/hooks/use-presence';
import {
  createElement,
  createElementId,
  defaultForType,
  elementRect,
  frameChildIds,
  resolveConnectorEndpoints,
  sortedElements,
  topZ,
} from '@colanode/ui/lib/board/elements';
import { generateNKeysBetween } from '@colanode/ui/lib/board/fractional-index';
import {
  AlignGuide,
  Anchor,
  anchorPoint,
  buildConnectorPath,
  computeAlignmentSnap,
  connectorBendPoints,
  connectorHandlePoint,
  connectorWaypoints,
  nearestSegmentIndex,
  normalizeRect,
  pointInRotatedRect,
  pointsBounds,
  Rect,
  rectCenter,
  rectsIntersect,
  resizeRect,
  ResizeHandle,
  RESIZE_HANDLES,
  snap,
  unionBounds,
} from '@colanode/ui/lib/board/geometry';
import {
  addMindmapChild,
  addMindmapSibling,
  hasMindmapChildren,
  mindmapEdges,
  mindmapHiddenIds,
  toggleMindmapCollapsed,
} from '@colanode/ui/lib/board/mindmap';
import {
  buildSceneSvgString,
  downloadBlob,
  exportScenePng,
  exportSceneSvg,
} from '@colanode/ui/lib/board/png';
import { printHtmlDocument } from '@colanode/ui/lib/print';
import { getTemplate } from '@colanode/ui/lib/board/templates';
import { presenceColor } from '@colanode/ui/lib/presence';
import { cn } from '@colanode/ui/lib/utils';

// Shape types whose label the per-element text-size controls apply to.
const TEXT_CAPABLE_TYPES: BoardElementType[] = [
  'sticky',
  'rect',
  'ellipse',
  'diamond',
  'text',
  'mindmap',
  'frame',
];

// Sides a quick-connect "+" handle can sit on / a new shape can be spawned to.
type QuickSide = 'top' | 'right' | 'bottom' | 'left';
const OPPOSITE_SIDE: Record<QuickSide, QuickSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const GRID = 20;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;

// Quick-reaction palette floated on the board and broadcast to everyone.
const REACTION_EMOJIS = ['👍', '❤️', '🎉', '😂', '🔥', '👀', '✅', '❓'];
// A floated reaction lives this long (ms) before it is removed.
const REACTION_TTL = 2500;
// A remote laser dot is shown only while a fresh update keeps arriving.
const LASER_TTL = 1200;
// Screen-space distance (px) at which a dragged element snaps to another
// element's edge/center. Divided by zoom to get the scene-unit threshold.
const ALIGN_SNAP_PX = 6;

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface Point {
  x: number;
  y: number;
}

type Interaction =
  | { mode: 'pan'; startClient: Point; startViewport: Viewport }
  | { mode: 'marquee'; start: Point; current: Point; additive: boolean }
  | {
      mode: 'move';
      start: Point;
      before: BoardScene;
      origin: Record<string, Point>;
    }
  | {
      mode: 'resize';
      id: string;
      handle: ResizeHandle;
      start: Point;
      origRect: Rect;
      before: BoardScene;
    }
  | {
      mode: 'rotate';
      id: string;
      center: Point;
      startAngle: number;
      origRotation: number;
      before: BoardScene;
    }
  | { mode: 'create'; id: string; start: Point; before: BoardScene }
  | {
      mode: 'connector';
      id: string;
      before: BoardScene;
    }
  | { mode: 'connector-bend'; id: string; index: number; before: BoardScene }
  | { mode: 'pen'; id: string; before: BoardScene };

interface WhiteboardCanvasProps {
  node: LocalNode;
  role: NodeRole;
  // Rendered as an in-page embed (fixed-height, read-only preview). Changes
  // how wheel/touch behave (yield to page scroll) and hides the collaboration
  // controls so the preview never broadcasts presence onto the real board.
  embedded?: boolean;
  // Which node attribute stores the persisted board scene: whiteboards use
  // `scene`; a page/folder opened as a board uses `boardScene`. Defaults to
  // `scene`, so real whiteboard nodes are unaffected.
  sceneField?: 'scene' | 'boardScene';
}

// A live reaction floating up on the canvas (local + remote), keyed for its
// short lifetime. Purely ephemeral — never persisted.
interface FloatingReaction {
  key: string;
  emoji: string;
  x: number;
  y: number;
  // Who sent it, shown briefly under the emoji.
  name?: string;
}

const cloneScene = (scene: BoardScene): BoardScene =>
  JSON.parse(JSON.stringify(scene)) as BoardScene;

// Reads the persisted board scene from whichever attribute this node type keeps
// it under: whiteboards store it on `scene`, pages/folders opened as a board on
// the optional `boardScene`. The discriminated-union narrowing keeps the access
// fully typed (both are `BoardScene | undefined` on the flattened node) — no
// `any` / cast needed.
const getSceneAttr = (
  node: LocalNode,
  field: 'scene' | 'boardScene'
): BoardScene | undefined => {
  if (field === 'scene') {
    return node.type === 'whiteboard' ? node.scene : undefined;
  }
  return node.type === 'page' || node.type === 'folder'
    ? node.boardScene
    : undefined;
};

// Floating board menus (quick-connect picker) must escape the board's
// `overflow-hidden` container and stay painted while the board is fullscreen.
// The Fullscreen API only paints the fullscreen subtree, so portal into the
// current fullscreen element when there is one, else <body>; both pair with
// position:fixed anchored to viewport coordinates.
const boardPortalTarget = (): HTMLElement =>
  (document.fullscreenElement as HTMLElement | null) ?? document.body;

export const WhiteboardCanvas = ({
  node,
  role,
  embedded = false,
  sceneField = 'scene',
}: WhiteboardCanvasProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const canEdit = hasNodeRole(role, 'editor');
  const canComment = hasNodeRole(role, 'collaborator');
  // Collaboration affordances (laser/reaction buttons, the presence/follow
  // menu) and presence broadcasting only make sense for an editor working on
  // the live board — never for a read-only viewer or an in-page embed.
  const showCollabControls = canEdit && !embedded;

  const presences = usePresences(node.id);
  const { publish: publishPresence } = usePresencePublisher({
    nodeId: node.id,
    rootId: node.rootId,
    kind: 'board',
  });
  const lastScenePointerRef = useRef<{ x: number; y: number } | null>(null);

  // Element ids a remote collaborator currently has open for inline
  // editing, mapped to their name — drives the soft-lock (block local edit
  // + badge). Non-persisted, pure UX.
  const remoteEditing = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of presences) {
      const id = p.payload.editingElementId;
      if (id) {
        map.set(id, p.name || 'Someone');
      }
    }
    return map;
  }, [presences]);

  const [scene, setScene] = useState<BoardScene>(
    () => getSceneAttr(node, sceneField) ?? {}
  );
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<BoardTool>('select');
  const [selection, setSelection] = useState<string[]>([]);
  // Element whose comment-thread panel is open (Miro-style board comments).
  const [commentElementId, setCommentElementId] = useState<string | null>(
    null
  );
  // All comment `message` nodes parented to this whiteboard. A comment
  // "belongs" to an element when its optional `anchorId` equals that element
  // id — reusing the existing message collection, no new store or sync path.
  const boardCommentsQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'message'))
        .where(({ nodes }) => eq(nodes.parentId, node.id)),
    [workspace.userId, node.id]
  );
  const commentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of boardCommentsQuery.data ?? []) {
      const anchorId = (node as { anchorId?: string | null }).anchorId;
      if (anchorId) {
        map.set(anchorId, (map.get(anchorId) ?? 0) + 1);
      }
    }
    return map;
  }, [boardCommentsQuery.data]);
  const [style, setStyle] = useState<BoardStyleState>(DEFAULT_BOARD_STYLE);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(
    null
  );
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Smart alignment guide lines shown while dragging, in scene coordinates.
  const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([]);
  // Element currently under the pointer while linking with the connector tool;
  // drives the anchor-dot hover feedback so users see where a link will snap.
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null);
  // Open quick-connect picker: which shape + side triggered it and where (in
  // container-relative screen coords) to float the shape-type menu.
  const [quickConnect, setQuickConnect] = useState<{
    sourceId: string;
    side: QuickSide;
    screen: Point;
  } | null>(null);
  const [history, setHistory] = useState<{
    past: BoardScene[];
    future: BoardScene[];
  }>({ past: [], future: [] });

  // ----- multi-user collaboration (ephemeral) ------------------------------
  // Follow-mode: the id of the collaborator whose viewport we mirror live, or
  // null. Cleared as soon as the local user pans / zooms.
  const [followUserId, setFollowUserId] = useState<string | null>(null);
  const [followMenuOpen, setFollowMenuOpen] = useState(false);
  // Laser-pointer mode: while on, pointer moves broadcast a colored dot instead
  // of interacting with the canvas.
  const [laserActive, setLaserActive] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  // Live floated reactions (local + remote) currently on screen.
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  // Local laser dot (own colour); mirrors are read from remote presences.
  const [localLaser, setLocalLaser] = useState<{ x: number; y: number } | null>(
    null
  );
  // Forces a re-render so stale remote laser dots fade out on their TTL even
  // when no new presence arrives.
  const [, setLaserTick] = useState(0);
  const followUserIdRef = useRef<string | null>(null);
  followUserIdRef.current = followUserId;
  const laserActiveRef = useRef(false);
  laserActiveRef.current = laserActive;
  // Last reaction timestamp seen per remote session, so a re-broadcast of the
  // same payload (heartbeat) does not spawn the emoji twice.
  const seenReactionRef = useRef<Map<string, number>>(new Map());
  const myColor = useMemo(
    () => presenceColor(workspace.userId),
    [workspace.userId]
  );

  // Current user's display name, shown under a reaction so everyone (including
  // the sender) sees who reacted.
  const currentUserQuery = useLiveQuery(
    (q) =>
      q
        .from({ users: workspace.collections.users })
        .where(({ users }) => eq(users.id, workspace.userId))
        .findOne(),
    [workspace.userId]
  );
  const currentUserName =
    (currentUserQuery.data as { name?: string } | undefined)?.name ?? 'You';

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sceneGroupRef = useRef<SVGGElement>(null);
  const sceneRef = useRef(scene);
  const viewportRef = useRef(viewport);
  const toolRef = useRef(tool);
  const selectionRef = useRef(selection);
  const interactionRef = useRef<Interaction | null>(null);
  // Set on a Ctrl/Cmd+right-click we handled ourselves (add/remove bend) so
  // the element's onContextMenu does not also open a comment popup.
  const suppressContextMenuRef = useRef(false);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ dist: number; viewport: Viewport } | null>(null);
  const spaceRef = useRef(false);
  const persistPendingRef = useRef<Set<string> | null>(null);
  const rafRef = useRef<number | null>(null);
  const editingRef = useRef(editing);

  sceneRef.current = scene;
  viewportRef.current = viewport;
  toolRef.current = tool;
  selectionRef.current = selection;
  editingRef.current = editing;

  // Broadcast presence with the CURRENT pointer / selection / edit / viewport,
  // plus any ephemeral extras (reaction, laser). Always carrying the viewport
  // is what powers follow-mode; carrying it on every publish means a follower
  // never loses the leader between pointer moves.
  const publishBoardPresence = useCallback(
    (extra?: Partial<PresencePayload>) => {
      // A read-only viewer or an in-page embed must never broadcast presence
      // (live cursor, laser dots, reactions, viewport) onto the shared board —
      // only an editor working on the live board does.
      if (!canEdit || embedded) {
        return;
      }
      publishPresence({
        pointer: lastScenePointerRef.current ?? undefined,
        selectedElementIds: selectionRef.current,
        editingElementId: editingRef.current?.id ?? null,
        viewport: viewportRef.current,
        ...extra,
      });
    },
    [publishPresence, canEdit, embedded]
  );

  // Elements the local user is actively manipulating: their in-flight local
  // state must win over incoming remote/persisted data. Everything else still
  // adopts remote updates.
  const lockedElementIds = (): Set<string> => {
    const locked = new Set<string>();
    const editingId = editingRef.current?.id;
    if (editingId) {
      locked.add(editingId);
    }
    const it = interactionRef.current;
    if (it) {
      if (it.mode === 'move') {
        for (const id of Object.keys(it.origin)) {
          locked.add(id);
        }
      } else if (
        it.mode === 'resize' ||
        it.mode === 'rotate' ||
        it.mode === 'create' ||
        it.mode === 'connector' ||
        it.mode === 'connector-bend' ||
        it.mode === 'pen'
      ) {
        locked.add(it.id);
      }
    }
    return locked;
  };

  // Adopt remote / persisted scene changes with a per-element diff (O(changed),
  // never a whole-scene stringify) so remote edits land LIVE even while the
  // local user drags — every element except the ones under the local gesture
  // is merged in immediately.
  useEffect(() => {
    const incoming = getSceneAttr(node, sceneField) ?? {};
    const current = sceneRef.current;
    const locked = lockedElementIds();

    let changed = false;
    const next: BoardScene = { ...current };
    const ids = new Set<string>([
      ...Object.keys(incoming),
      ...Object.keys(current),
    ]);
    for (const id of ids) {
      if (locked.has(id)) {
        continue;
      }
      const inc = incoming[id];
      const cur = current[id];
      if (inc === undefined) {
        if (cur !== undefined) {
          delete next[id];
          changed = true;
        }
      } else if (
        cur === undefined ||
        JSON.stringify(inc) !== JSON.stringify(cur)
      ) {
        next[id] = inc;
        changed = true;
      }
    }

    if (changed) {
      sceneRef.current = next;
      setScene(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSceneAttr(node, sceneField)]);

  // Announce presence on mount so the "who's viewing" stack shows this user
  // even before they move the pointer.
  useEffect(() => {
    publishBoardPresence();
  }, [publishBoardPresence]);

  // Drop the connector hover highlight whenever the connector tool is inactive.
  useEffect(() => {
    if (tool !== 'connector') {
      setLinkHoverId(null);
    }
  }, [tool]);

  // Close the quick-connect picker whenever the selection changes.
  useEffect(() => {
    setQuickConnect(null);
  }, [selection]);

  // Keep local fullscreen state in sync with the browser (e.g. Esc to exit).
  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Toggle true browser fullscreen on the container div (not the <svg>) so the
  // toolbar, overlays and inline editor stay inside the fullscreen element.
  const toggleFullscreen = () => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void node.requestFullscreen();
    }
  };

  // Re-broadcast presence when the local selection / inline-edit / viewport
  // changes so remote collaborators (and followers) see it even if the pointer
  // is not moving.
  useEffect(() => {
    publishBoardPresence();
  }, [selection, editing, viewport, publishBoardPresence]);

  // ----- follow-mode -------------------------------------------------------
  // While following, mirror the followed collaborator's viewport live. If they
  // disconnect, drop the follow.
  useEffect(() => {
    if (!followUserId) {
      return;
    }
    const target = presences.find((p) => p.userId === followUserId);
    if (!target) {
      setFollowUserId(null);
      return;
    }
    const vp = target.payload.viewport;
    if (vp) {
      const cur = viewportRef.current;
      if (cur.x !== vp.x || cur.y !== vp.y || cur.zoom !== vp.zoom) {
        setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
      }
    }
  }, [presences, followUserId]);

  // Stop following the moment the local user drives their own viewport.
  const cancelFollow = useCallback(() => {
    if (followUserIdRef.current) {
      setFollowUserId(null);
    }
  }, []);

  // ----- live reactions ----------------------------------------------------
  const addReaction = useCallback((r: Omit<FloatingReaction, 'key'>) => {
    const key = `${r.x}:${r.y}:${Math.random().toString(36).slice(2)}`;
    setReactions((list) => [...list, { ...r, key }]);
    setTimeout(() => {
      setReactions((list) => list.filter((item) => item.key !== key));
    }, REACTION_TTL);
  }, []);

  // Spawn remote collaborators' reactions when a fresh one arrives.
  useEffect(() => {
    const now = Date.now();
    for (const p of presences) {
      const rc = p.payload.reaction;
      if (!rc) {
        continue;
      }
      const sessionKey = `${p.userId}:${p.deviceId}`;
      const last = seenReactionRef.current.get(sessionKey) ?? 0;
      if (rc.at > last && now - rc.at < REACTION_TTL) {
        seenReactionRef.current.set(sessionKey, rc.at);
        addReaction({ emoji: rc.emoji, x: rc.x, y: rc.y, name: p.name });
      }
    }
  }, [presences, addReaction]);

  // Tick to expire stale remote laser dots when the stream stops.
  useEffect(() => {
    const hasRemoteLaser = presences.some((p) => p.payload.laser);
    if (!hasRemoteLaser) {
      return;
    }
    const iv = setInterval(() => setLaserTick((t) => t + 1), 400);
    return () => clearInterval(iv);
  }, [presences]);

  // ----- coordinate helpers ------------------------------------------------
  const clientToScene = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    const vp = viewportRef.current;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: (clientX - left - vp.x) / vp.zoom,
      y: (clientY - top - vp.y) / vp.zoom,
    };
  };

  const sceneToClient = (p: Point): Point => {
    const vp = viewportRef.current;
    return { x: vp.x + p.x * vp.zoom, y: vp.y + p.y * vp.zoom };
  };

  const maybeSnap = (value: number): number =>
    snapEnabled ? snap(value, GRID) : value;

  // ----- hard shape lock ---------------------------------------------------
  // An element is "locked for me" when it is hard-locked by SOMEONE ELSE.
  // Its owner (lockedBy === me) keeps full control; anyone may still unlock it
  // through the toolbar toggle.
  const isLockedForMe = (id: string): boolean => {
    const el = sceneRef.current[id];
    return !!el?.locked && el.lockedBy !== workspace.userId;
  };

  // Filter a set of ids down to the ones the local user is allowed to mutate
  // (drops elements hard-locked by others).
  const manipulableIds = (ids: string[]): string[] =>
    ids.filter((id) => !isLockedForMe(id));

  // Lock the selection to the local user, or unlock it if it is already fully
  // locked. Locking stamps `lockedBy` = me; unlocking clears both fields
  // (kept absent so the element round-trips like a legacy, never-locked one).
  const toggleLockSelection = () => {
    const ids = selectionRef.current;
    if (ids.length === 0) {
      return;
    }
    const allLocked = ids.every((id) => !!sceneRef.current[id]?.locked);
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    const changed: string[] = [];
    for (const id of ids) {
      const el = next[id];
      if (!el) {
        continue;
      }
      if (allLocked) {
        const { locked: _locked, lockedBy: _lockedBy, ...rest } = el;
        void _locked;
        void _lockedBy;
        next[id] = rest;
      } else {
        next[id] = { ...el, locked: true, lockedBy: workspace.userId };
      }
      changed.push(id);
    }
    if (changed.length > 0) {
      commit(before, next, changed);
    }
  };

  // ----- ephemeral collaboration (reactions + laser) -----------------------
  // Scene point at the centre of the current viewport (fallback for a
  // reaction when the pointer position is unknown).
  const viewportCenterScene = (): Point => {
    const vp = viewportRef.current;
    const cw = svgRef.current?.clientWidth ?? 800;
    const ch = svgRef.current?.clientHeight ?? 600;
    return { x: (cw / 2 - vp.x) / vp.zoom, y: (ch / 2 - vp.y) / vp.zoom };
  };

  const emitReaction = (emoji: string) => {
    // Spawn at the viewport centre (always on-screen) rather than the last
    // canvas pointer, which is often off-screen after a pan — that made the
    // reaction look like nothing happened.
    const pt = viewportCenterScene();
    addReaction({ emoji, x: pt.x, y: pt.y, name: currentUserName });
    publishBoardPresence({ reaction: { emoji, x: pt.x, y: pt.y, at: Date.now() } });
  };

  // ----- persistence (element-level, collision-safe) -----------------------
  const persistIds = useCallback(
    (ids: string[], source: BoardScene) => {
      if (!canEdit || ids.length === 0) {
        return;
      }
      const nodes = workspace.collections.nodes;
      if (!nodes.has(node.id)) {
        return;
      }
      nodes.update(node.id, (draft) => {
        if (
          draft.type !== 'whiteboard' &&
          draft.type !== 'page' &&
          draft.type !== 'folder'
        ) {
          return;
        }
        const current =
          (sceneField === 'scene'
            ? draft.type === 'whiteboard'
              ? draft.scene
              : undefined
            : draft.type === 'page' || draft.type === 'folder'
              ? draft.boardScene
              : undefined) ?? {};
        const next: BoardScene = { ...current };
        for (const id of ids) {
          const el = source[id];
          if (el === undefined) {
            delete next[id];
          } else {
            next[id] = el;
          }
        }
        if (sceneField === 'scene') {
          if (draft.type === 'whiteboard') {
            draft.scene = next;
          }
        } else if (draft.type === 'page' || draft.type === 'folder') {
          draft.boardScene = next;
        }
      });
    },
    [canEdit, workspace, node.id, sceneField]
  );

  const flushPersist = useCallback(() => {
    rafRef.current = null;
    const ids = persistPendingRef.current;
    persistPendingRef.current = null;
    if (ids && ids.size > 0) {
      persistIds([...ids], sceneRef.current);
    }
  }, [persistIds]);

  const schedulePersist = useCallback(
    (ids: string[]) => {
      if (!persistPendingRef.current) {
        persistPendingRef.current = new Set();
      }
      ids.forEach((id) => persistPendingRef.current!.add(id));
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushPersist);
      }
    },
    [flushPersist]
  );

  useEffect(
    () => () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    []
  );

  const applyLocal = (next: BoardScene) => {
    sceneRef.current = next;
    setScene(next);
  };

  // Commit a discrete edit: push one history entry then persist the ids.
  const commit = (before: BoardScene, next: BoardScene, ids: string[]) => {
    setHistory((h) => ({
      past: [...h.past.slice(-99), before],
      future: [],
    }));
    applyLocal(next);
    persistIds(ids, next);
  };

  const diffIds = (a: BoardScene, b: BoardScene): string[] => {
    const ids = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
    const changed: string[] = [];
    for (const id of ids) {
      if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) {
        changed.push(id);
      }
    }
    return changed;
  };

  const undo = () => {
    setHistory((h) => {
      const prev = h.past[h.past.length - 1];
      if (prev === undefined) {
        return h;
      }
      const current = sceneRef.current;
      const ids = diffIds(current, prev);
      applyLocal(prev);
      persistIds(ids, prev);
      return { past: h.past.slice(0, -1), future: [...h.future, current] };
    });
  };

  const redo = () => {
    setHistory((h) => {
      const nextScene = h.future[h.future.length - 1];
      if (nextScene === undefined) {
        return h;
      }
      const current = sceneRef.current;
      const ids = diffIds(current, nextScene);
      applyLocal(nextScene);
      persistIds(ids, nextScene);
      return {
        past: [...h.past, current],
        future: h.future.slice(0, -1),
      };
    });
  };

  // ----- folder board auto-seed -------------------------------------------
  // A page OR folder opened as a Board (sceneField === 'boardScene') is seeded
  // with one nodeCard per navigable child, so its sub-pages / subfolders show up
  // as cards the user can wire together with connectors. Real whiteboards
  // (sceneField === 'scene') are never seeded. The children live-query mirrors
  // PageChildren. (Page and folder are the same container since the merge.)
  const isContainerBoard =
    (node.type === 'page' || node.type === 'folder') &&
    sceneField === 'boardScene';
  const folderChildrenQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.parentId, node.id))
        .where(({ nodes }) =>
          inArray(nodes.type, ['page', 'database', 'folder', 'whiteboard'])
        )
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    [workspace.userId, node.id]
  );

  useEffect(() => {
    if (!isContainerBoard || !canEdit) {
      return;
    }
    const children = folderChildrenQuery.data;
    // Only seed once children have actually loaded (null = still loading).
    if (!children) {
      return;
    }
    // A page also gets a card for ITSELF, so a leaf page with no children
    // still shows and edits its own content on its board instead of an empty
    // canvas. Its self-card is seeded first (top-left).
    const seedTargets: LocalNode[] =
      node.type === 'page' ? [node, ...children] : children;
    if (seedTargets.length === 0) {
      return;
    }
    const current = sceneRef.current;
    // Idempotency: collect the node ids already carded so we only ever ADD the
    // missing ones - existing cards (and any user-drawn position / connectors)
    // are never moved or removed across reloads.
    const carded = new Set<string>();
    let existingCards = 0;
    for (const el of Object.values(current)) {
      if (el.type === 'nodeCard') {
        existingCards += 1;
        if (el.nodeId) {
          carded.add(el.nodeId);
        }
      }
    }
    const missing = seedTargets.filter((child) => !carded.has(child.id));
    if (missing.length === 0) {
      return;
    }
    const COLS = 3;
    const COL_W = 330;
    const ROW_H = 290;
    const ORIGIN_X = 40;
    const ORIGIN_Y = 40;
    const zKeys = generateNKeysBetween(topZ(current), null, missing.length);
    const next: BoardScene = { ...current };
    const newIds: string[] = [];
    missing.forEach((child, i) => {
      // Continue the grid after any cards already present so re-seeds append
      // beside/below existing cards rather than overlapping them.
      const slot = existingCards + i;
      const el = createElement({
        type: 'nodeCard',
        x: ORIGIN_X + (slot % COLS) * COL_W,
        y: ORIGIN_Y + Math.floor(slot / COLS) * ROW_H,
        z: zKeys[i]!,
        nodeId: child.id,
      });
      next[el.id] = el;
      newIds.push(el.id);
    });
    // Persist through the same merge-and-sync path a normal element insert uses.
    applyLocal(next);
    persistIds(newIds, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContainerBoard, canEdit, folderChildrenQuery.data]);

  // ----- board mention connectors (auto) -----------------------------------
  // Once the child cards exist, wire cards whose pages mention each other so the
  // board shows the links between pages. node_references is not a react-db
  // collection, so each child's document is read imperatively and its mentions
  // extracted; only a mention pointing at another card ON THIS BOARD becomes a
  // connector. Idempotent: never duplicates an existing from->to pair.
  useEffect(() => {
    if (!isContainerBoard || !canEdit) {
      return;
    }
    const children = folderChildrenQuery.data;
    if (!children || children.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const scene = sceneRef.current;
      const cardByNode = new Map<string, string>();
      for (const el of Object.values(scene)) {
        if (el.type === 'nodeCard' && el.nodeId) {
          cardByNode.set(el.nodeId, el.id);
        }
      }
      if (cardByNode.size === 0) {
        return;
      }
      const childIds = new Set(children.map((child) => child.id));
      const existingPairs = new Set<string>();
      for (const el of Object.values(scene)) {
        if (
          el.type === 'connector' &&
          el.connector?.fromId &&
          el.connector?.toId
        ) {
          existingPairs.add(el.connector.fromId + '->' + el.connector.toId);
        }
      }
      const edges: Array<{ from: string; to: string }> = [];
      for (const child of children) {
        const fromCard = cardByNode.get(child.id);
        if (!fromCard) {
          continue;
        }
        const doc = await window.colanode.executeQuery({
          type: 'document.get',
          userId: workspace.userId,
          documentId: child.id,
        });
        if (cancelled) {
          return;
        }
        const content = doc?.content;
        if (!content || content.type !== 'rich_text') {
          continue;
        }
        const mentions = extractBlocksMentions(child.id, content.blocks);
        const seen = new Set<string>();
        for (const mention of mentions) {
          const target = mention.target;
          if (
            !target ||
            target === child.id ||
            seen.has(target) ||
            !childIds.has(target)
          ) {
            continue;
          }
          seen.add(target);
          const toCard = cardByNode.get(target);
          if (toCard && !existingPairs.has(fromCard + '->' + toCard)) {
            edges.push({ from: fromCard, to: toCard });
            existingPairs.add(fromCard + '->' + toCard);
          }
        }
      }
      if (cancelled || edges.length === 0) {
        return;
      }
      const base = sceneRef.current;
      const next: BoardScene = { ...base };
      const newIds: string[] = [];
      const zKeys = generateNKeysBetween(topZ(base), null, edges.length);
      edges.forEach((edge, i) => {
        const conn = createElement({
          type: 'connector',
          x: 0,
          y: 0,
          z: zKeys[i]!,
        });
        conn.connector = { fromId: edge.from, toId: edge.to, arrowEnd: true };
        next[conn.id] = conn;
        newIds.push(conn.id);
      });
      applyLocal(next);
      persistIds(newIds, next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContainerBoard, canEdit, folderChildrenQuery.data]);

  // ----- element helpers ---------------------------------------------------
  const styleForType = (type: BoardTool): Partial<BoardElementStyle> => {
    if (type === 'sticky') {
      return { fill: style.stickyColor, color: '#1f2937', opacity: style.opacity };
    }
    if (type === 'text') {
      return { color: style.stroke, opacity: style.opacity };
    }
    if (type === 'connector' || type === 'pen') {
      return {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeStyle: style.strokeStyle,
        opacity: style.opacity,
      };
    }
    return {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeStyle: style.strokeStyle,
      opacity: style.opacity,
    };
  };

  const elementAt = (p: Point, opts?: { shapesOnly?: boolean }): BoardElement | null => {
    const list = sortedElements(sceneRef.current);
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i]!;
      if (el.type === 'connector' || el.type === 'freehand') {
        if (opts?.shapesOnly) {
          continue;
        }
        continue; // hit connectors/freehand via their own hit path only
      }
      if (pointInRotatedRect(p, elementRect(el), el.rotation ?? 0)) {
        return el;
      }
    }
    return null;
  };

  // ----- pointer interaction ----------------------------------------------
  const beginPan = (e: ReactPointerEvent) => {
    cancelFollow();
    interactionRef.current = {
      mode: 'pan',
      startClient: { x: e.clientX, y: e.clientY },
      startViewport: { ...viewportRef.current },
    };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    svgRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Laser mode: broadcast a dot, never interact with the canvas.
    if (laserActiveRef.current) {
      const lp = clientToScene(e.clientX, e.clientY);
      lastScenePointerRef.current = lp;
      setLocalLaser(lp);
      publishBoardPresence({ laser: { x: lp.x, y: lp.y, at: Date.now() } });
      return;
    }

    if (pointersRef.current.size === 2) {
      cancelFollow();
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        viewport: { ...viewportRef.current },
      };
      interactionRef.current = null;
      return;
    }

    // Ctrl/Cmd + right-click on a connector: add a reshape bend on the line,
    // or remove a bend when the click lands on an existing handle. Handled
    // here (before the pan/right-click path) and never opens a menu.
    if (canEdit && e.button === 2 && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      suppressContextMenuRef.current = true;
      const rcTarget = e.target as Element;
      const rcPoint = clientToScene(e.clientX, e.clientY);
      const rcHandle = rcTarget.closest('[data-connector-handle]');
      if (rcHandle) {
        const cid = rcHandle.getAttribute('data-connector-handle')!;
        const idxAttr = rcHandle.getAttribute('data-bend-index');
        const el = sceneRef.current[cid];
        if (
          el &&
          el.type === 'connector' &&
          !isLockedForMe(cid) &&
          idxAttr !== null &&
          idxAttr !== 'new'
        ) {
          const index = Number(idxAttr);
          const bends = connectorBendPoints(
            el.connector?.bends,
            el.connector?.bend
          ).slice();
          if (index >= 0 && index < bends.length) {
            bends.splice(index, 1);
            const before = cloneScene(sceneRef.current);
            const next = {
              ...sceneRef.current,
              [cid]: {
                ...el,
                connector: { ...el.connector, bends, bend: undefined },
              },
            };
            commit(before, next, [cid]);
          }
        }
        return;
      }
      const rcEl = rcTarget.closest('[data-el-id]');
      if (rcEl) {
        const cid = rcEl.getAttribute('data-el-id')!;
        const el = sceneRef.current[cid];
        if (el && el.type === 'connector' && !isLockedForMe(cid)) {
          const { start, end } = resolveConnectorEndpoints(
            el,
            sceneRef.current
          );
          const routing = el.connector?.routing ?? 'straight';
          const bends = connectorBendPoints(
            el.connector?.bends,
            el.connector?.bend
          );
          const pts = connectorWaypoints(routing, start, end, bends);
          const k = nearestSegmentIndex(pts, rcPoint);
          const nextBends = bends.slice();
          nextBends.splice(k, 0, rcPoint);
          const before = cloneScene(sceneRef.current);
          const next = {
            ...sceneRef.current,
            [cid]: {
              ...el,
              connector: {
                ...el.connector,
                bends: nextBends,
                bend: undefined,
              },
            },
          };
          commit(before, next, [cid]);
        }
        return;
      }
      return;
    }

    const panIntent =
      spaceRef.current ||
      e.button === 1 ||
      e.button === 2 ||
      toolRef.current === 'hand';
    if (panIntent) {
      beginPan(e);
      return;
    }

    const p = clientToScene(e.clientX, e.clientY);
    const target = e.target as Element;
    const handleEl = target.closest('[data-handle]');
    const elEl = target.closest('[data-el-id]');
    const collapseEl = target.closest('[data-collapse]');

    // mindmap collapse toggle badge takes priority over selection
    if (collapseEl) {
      if (canEdit) {
        mindmapToggleCollapse(collapseEl.getAttribute('data-collapse')!);
      }
      return;
    }

    // quick-connect "+" handle: open the shape-type picker for that side.
    const quickEl = target.closest('[data-quick]');
    if (quickEl) {
      if (canEdit && selectionRef.current.length === 1) {
        openQuickConnect(
          selectionRef.current[0]!,
          quickEl.getAttribute('data-quick') as QuickSide
        );
      }
      return;
    }

    // mindmap "+" affordance: add a child node directly.
    const mindAddEl = target.closest('[data-mindadd]');
    if (mindAddEl) {
      if (canEdit) {
        mindmapAddChild(mindAddEl.getAttribute('data-mindadd')!);
      }
      return;
    }

    // any other pointer-down dismisses an open quick-connect picker
    if (quickConnect) {
      setQuickConnect(null);
    }

    if (!canEdit) {
      if (elEl) {
        setSelection([elEl.getAttribute('data-el-id')!]);
      } else {
        setSelection([]);
      }
      return;
    }

    // resize / rotate handles (single selection)
    if (handleEl && selectionRef.current.length === 1) {
      const id = selectionRef.current[0]!;
      const el = sceneRef.current[id];
      if (el && isLockedForMe(id)) {
        return;
      }
      if (el) {
        const handleType = handleEl.getAttribute('data-handle')!;
        if (handleType === 'rotate') {
          const center = rectCenter(elementRect(el));
          interactionRef.current = {
            mode: 'rotate',
            id,
            center,
            startAngle: Math.atan2(p.y - center.y, p.x - center.x),
            origRotation: el.rotation ?? 0,
            before: cloneScene(sceneRef.current),
          };
        } else {
          interactionRef.current = {
            mode: 'resize',
            id,
            handle: handleType as ResizeHandle,
            start: p,
            origRect: elementRect(el),
            before: cloneScene(sceneRef.current),
          };
        }
        return;
      }
    }

    // connector reshape handle: drag the elbow corner / curve control point.
    const bendHandleEl = target.closest('[data-connector-handle]');
    if (bendHandleEl && selectionRef.current.length === 1) {
      const id = selectionRef.current[0]!;
      const el = sceneRef.current[id];
      if (el && el.type === 'connector' && !isLockedForMe(id)) {
        const idxAttr = bendHandleEl.getAttribute('data-bend-index');
        // 'new' (or absent) => this drag creates the first bend at index 0.
        const index =
          idxAttr === null || idxAttr === 'new' ? 0 : Number(idxAttr);
        interactionRef.current = {
          mode: 'connector-bend',
          id,
          index,
          before: cloneScene(sceneRef.current),
        };
        return;
      }
    }

    const t = toolRef.current;

    if (t === 'connector') {
      const from = elementAt(p);
      const z = topZ(sceneRef.current);
      const connector = createElement({
        type: 'connector',
        x: 0,
        y: 0,
        z,
        style: styleForType('connector'),
        points: [
          [p.x, p.y],
          [p.x, p.y],
        ],
      });
      connector.connector = from ? { fromId: from.id, arrowEnd: true } : { arrowEnd: true };
      const before = cloneScene(sceneRef.current);
      applyLocal({ ...sceneRef.current, [connector.id]: connector });
      interactionRef.current = { mode: 'connector', id: connector.id, before };
      return;
    }

    if (t === 'pen') {
      const z = topZ(sceneRef.current);
      const pen = createElement({
        type: 'freehand',
        x: p.x,
        y: p.y,
        z,
        style: styleForType('pen'),
        points: [[p.x, p.y]],
      });
      const before = cloneScene(sceneRef.current);
      applyLocal({ ...sceneRef.current, [pen.id]: pen });
      interactionRef.current = { mode: 'pen', id: pen.id, before };
      return;
    }

    if (t === 'sticky' || t === 'text' || t === 'mindmap') {
      placeClickElement(t, p);
      return;
    }

    if (t === 'rect' || t === 'ellipse' || t === 'diamond' || t === 'frame') {
      const z = topZ(sceneRef.current);
      const el = createElement({
        type: t,
        x: maybeSnap(p.x),
        y: maybeSnap(p.y),
        w: 1,
        h: 1,
        z,
        style: styleForType(t),
      });
      const before = cloneScene(sceneRef.current);
      applyLocal({ ...sceneRef.current, [el.id]: el });
      setSelection([el.id]);
      interactionRef.current = {
        mode: 'create',
        id: el.id,
        start: { x: maybeSnap(p.x), y: maybeSnap(p.y) },
        before,
      };
      return;
    }

    // select tool
    if (elEl) {
      const id = elEl.getAttribute('data-el-id')!;
      const additive = e.shiftKey;
      let nextSel: string[];
      if (additive) {
        nextSel = selectionRef.current.includes(id)
          ? selectionRef.current.filter((s) => s !== id)
          : [...selectionRef.current, id];
      } else {
        nextSel = selectionRef.current.includes(id)
          ? selectionRef.current
          : [id];
      }
      setSelection(nextSel);
      const origin: Record<string, Point> = {};
      // moving a frame drags its contents along with it; elements hard-locked
      // by another user are excluded so they stay put.
      for (const sid of withFrameChildren(nextSel)) {
        if (isLockedForMe(sid)) {
          continue;
        }
        const el = sceneRef.current[sid];
        if (el) {
          origin[sid] = { x: el.x, y: el.y };
        }
      }
      // Nothing movable (everything locked by others) — keep the selection but
      // do not start a drag.
      if (Object.keys(origin).length === 0) {
        return;
      }
      interactionRef.current = {
        mode: 'move',
        start: p,
        before: cloneScene(sceneRef.current),
        origin,
      };
      return;
    }

    // empty canvas -> marquee
    setSelection(e.shiftKey ? selectionRef.current : []);
    interactionRef.current = {
      mode: 'marquee',
      start: p,
      current: p,
      additive: e.shiftKey,
    };
  };

  const placeClickElement = (
    t: 'sticky' | 'text' | 'mindmap',
    p: Point
  ) => {
    const z = topZ(sceneRef.current);
    const el = createElement({
      type: t,
      x: maybeSnap(p.x - (t === 'text' ? 0 : 90)),
      y: maybeSnap(p.y - (t === 'text' ? 20 : 70)),
      z,
      style: styleForType(t),
      text: '',
    });
    if (t === 'mindmap') {
      el.mindmap = {};
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current, [el.id]: el };
    commit(before, next, [el.id]);
    setSelection([el.id]);
    setEditing({ id: el.id, value: '' });
    setTool('select');
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Broadcast the local pointer (throttled inside the publisher) so remote
    // collaborators see this cursor move, regardless of the current gesture.
    const scenePointer = clientToScene(e.clientX, e.clientY);
    lastScenePointerRef.current = scenePointer;

    // Laser mode: stream a dot, suppress all canvas interaction.
    if (laserActiveRef.current) {
      setLocalLaser(scenePointer);
      publishBoardPresence({
        laser: { x: scenePointer.x, y: scenePointer.y, at: Date.now() },
      });
      return;
    }

    publishBoardPresence();

    if (pinchRef.current && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const scale = dist / (pinchRef.current.dist || 1);
      const base = pinchRef.current.viewport;
      const rect = svgRef.current?.getBoundingClientRect();
      const midX = (a!.x + b!.x) / 2 - (rect?.left ?? 0);
      const midY = (a!.y + b!.y) / 2 - (rect?.top ?? 0);
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.zoom * scale));
      const sx = (midX - base.x) / base.zoom;
      const sy = (midY - base.y) / base.zoom;
      setViewport({ x: midX - sx * zoom, y: midY - sy * zoom, zoom });
      return;
    }

    // Connector tool: highlight the shape (and its anchors) the pointer is over
    // before a link is even started, so users see where it will snap.
    if (!interactionRef.current && toolRef.current === 'connector') {
      const hover = elementAt(clientToScene(e.clientX, e.clientY), {
        shapesOnly: true,
      });
      setLinkHoverId(hover?.id ?? null);
    }

    const it = interactionRef.current;
    if (!it) {
      return;
    }
    const p = clientToScene(e.clientX, e.clientY);

    switch (it.mode) {
      case 'pan': {
        setViewport({
          ...it.startViewport,
          x: it.startViewport.x + (e.clientX - it.startClient.x),
          y: it.startViewport.y + (e.clientY - it.startClient.y),
        });
        break;
      }
      case 'marquee': {
        interactionRef.current = { ...it, current: p };
        setViewport((v) => ({ ...v })); // trigger re-render for marquee
        break;
      }
      case 'move': {
        const rawDx = p.x - it.start.x;
        const rawDy = p.y - it.start.y;
        const movingIds = Object.keys(it.origin);
        const next = { ...sceneRef.current };
        // First pass: grid-snapped positions per element.
        const movedRects: Rect[] = [];
        for (const [id, o] of Object.entries(it.origin)) {
          const el = next[id];
          if (!el) {
            continue;
          }
          const x = maybeSnap(o.x + rawDx);
          const y = maybeSnap(o.y + rawDy);
          next[id] = { ...el, x, y };
          movedRects.push({ x, y, w: el.w, h: el.h });
        }

        // Second pass: smart alignment against the rest of the scene. Shift the
        // whole moving group by a single offset so multi-selection stays rigid.
        let guides: AlignGuide[] = [];
        const groupBounds = unionBounds(movedRects);
        if (snapEnabled && groupBounds) {
          const movingSet = new Set(movingIds);
          const others: Rect[] = [];
          for (const el of Object.values(sceneRef.current)) {
            if (
              movingSet.has(el.id) ||
              el.type === 'connector' ||
              el.type === 'freehand'
            ) {
              continue;
            }
            others.push(elementRect(el));
          }
          const align = computeAlignmentSnap(
            groupBounds,
            others,
            ALIGN_SNAP_PX / viewportRef.current.zoom
          );
          if (align.dx !== 0 || align.dy !== 0) {
            for (const id of movingIds) {
              const el = next[id];
              if (el) {
                next[id] = { ...el, x: el.x + align.dx, y: el.y + align.dy };
              }
            }
          }
          guides = align.guides;
        }
        setAlignGuides(guides);
        applyLocal(next);
        schedulePersist(movingIds);
        break;
      }
      case 'resize': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const raw = resizeRect(
          it.origRect,
          it.handle,
          p.x - it.start.x,
          p.y - it.start.y
        );
        const norm = normalizeRect(raw);
        const next = {
          ...sceneRef.current,
          [it.id]: {
            ...el,
            x: maybeSnap(norm.x),
            y: maybeSnap(norm.y),
            w: Math.max(8, maybeSnap(norm.w)),
            h: Math.max(8, maybeSnap(norm.h)),
          },
        };
        applyLocal(next);
        schedulePersist([it.id]);
        break;
      }
      case 'rotate': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const angle = Math.atan2(p.y - it.center.y, p.x - it.center.x);
        let deg = it.origRotation + ((angle - it.startAngle) * 180) / Math.PI;
        if (e.shiftKey) {
          deg = Math.round(deg / 15) * 15;
        }
        const next = {
          ...sceneRef.current,
          [it.id]: { ...el, rotation: Math.round(deg) },
        };
        applyLocal(next);
        schedulePersist([it.id]);
        break;
      }
      case 'create': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const r = normalizeRect({
          x: it.start.x,
          y: it.start.y,
          w: maybeSnap(p.x) - it.start.x,
          h: maybeSnap(p.y) - it.start.y,
        });
        const next = {
          ...sceneRef.current,
          [it.id]: { ...el, x: r.x, y: r.y, w: r.w, h: r.h },
        };
        applyLocal(next);
        break;
      }
      case 'connector': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const target = elementAt(p, { shapesOnly: true });
        setLinkHoverId(target?.id ?? null);
        const points = [el.points?.[0] ?? [p.x, p.y], [p.x, p.y]];
        const next = {
          ...sceneRef.current,
          [it.id]: {
            ...el,
            points,
            connector: {
              ...el.connector,
              toId: target?.id,
            },
          },
        };
        applyLocal(next);
        break;
      }
      case 'connector-bend': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const current = connectorBendPoints(
          el.connector?.bends,
          el.connector?.bend
        );
        const nextBends = current.slice();
        if (it.index >= nextBends.length) {
          nextBends.push({ x: p.x, y: p.y });
        } else {
          nextBends[it.index] = { x: p.x, y: p.y };
        }
        const next = {
          ...sceneRef.current,
          [it.id]: {
            ...el,
            connector: { ...el.connector, bends: nextBends, bend: undefined },
          },
        };
        applyLocal(next);
        schedulePersist([it.id]);
        break;
      }
      case 'pen': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const points = [...(el.points ?? []), [p.x, p.y]];
        const next = { ...sceneRef.current, [it.id]: { ...el, points } };
        applyLocal(next);
        break;
      }
    }
  };

  const finishInteraction = () => {
    const it = interactionRef.current;
    interactionRef.current = null;
    setLinkHoverId(null);
    setAlignGuides([]);
    if (!it) {
      return;
    }
    if (it.mode === 'pan') {
      return;
    }
    if (it.mode === 'marquee') {
      const box = normalizeRect({
        x: it.start.x,
        y: it.start.y,
        w: it.current.x - it.start.x,
        h: it.current.y - it.start.y,
      });
      const hits = sortedElements(sceneRef.current)
        .filter((el) => rectsIntersect(box, elementRect(el)))
        .map((el) => el.id);
      setSelection(
        it.additive ? [...new Set([...selectionRef.current, ...hits])] : hits
      );
      setViewport((v) => ({ ...v }));
      return;
    }

    if (it.mode === 'create') {
      const el = sceneRef.current[it.id];
      let next = sceneRef.current;
      if (el && (el.w < 8 || el.h < 8)) {
        const def = createElement({ type: el.type, x: el.x, y: el.y, z: el.z });
        next = {
          ...sceneRef.current,
          [it.id]: { ...el, w: def.w, h: def.h },
        };
        applyLocal(next);
      }
      commit(it.before, sceneRef.current, [it.id]);
      setTool('select');
      return;
    }

    if (it.mode === 'connector') {
      const el = sceneRef.current[it.id];
      // discard zero-length connectors
      if (el?.points) {
        const [a, b] = el.points;
        if (a && b && Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0)) < 4 && !el.connector?.toId) {
          const next = { ...sceneRef.current };
          delete next[it.id];
          applyLocal(next);
          persistIds([it.id], next);
          setTool('select');
          return;
        }
      }
      commit(it.before, sceneRef.current, [it.id]);
      setTool('select');
      return;
    }

    if (it.mode === 'pen') {
      const el = sceneRef.current[it.id];
      if (el?.points && el.points.length > 1) {
        const b = pointsBounds(el.points);
        const next = {
          ...sceneRef.current,
          [it.id]: { ...el, x: b.x, y: b.y, w: b.w, h: b.h },
        };
        applyLocal(next);
        commit(it.before, next, [it.id]);
      } else {
        const next = { ...sceneRef.current };
        delete next[it.id];
        applyLocal(next);
        persistIds([it.id], next);
      }
      return;
    }

    // move / resize / rotate
    const ids =
      it.mode === 'move'
        ? Object.keys(it.origin)
        : [(it as { id: string }).id];
    commit(it.before, sceneRef.current, ids);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      finishInteraction();
    }
  };

  // ----- wheel zoom to cursor ---------------------------------------------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      // In an in-page embed the board sits inside a short box mid-page, so a
      // plain wheel must scroll the PAGE, not zoom the board. Only intercept
      // the pinch-zoom gesture (ctrl/meta held); let every other wheel event
      // bubble so the page keeps scrolling past the embed.
      if (embedded && !e.ctrlKey && !e.metaKey) {
        return;
      }
      e.preventDefault();
      cancelFollow();
      const rect = el.getBoundingClientRect();
      const vp = viewportRef.current;
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const zoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, vp.zoom * factor)
        );
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const sx = (cx - vp.x) / vp.zoom;
        const sy = (cy - vp.y) / vp.zoom;
        setViewport({ x: cx - sx * zoom, y: cy - sy * zoom, zoom });
      } else {
        setViewport({ ...vp, x: vp.x - e.deltaX, y: vp.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [cancelFollow, embedded]);

  // ----- keyboard ----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;

      if (e.code === 'Space') {
        spaceRef.current = true;
        return;
      }

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      // Ctrl/Cmd+A selects every board element (not the page text). Works for
      // viewers too; the INPUT/TEXTAREA/contentEditable guard above already lets
      // a real text field keep the native select-all.
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelection(Object.keys(sceneRef.current));
        return;
      }
      if (!canEdit) {
        return;
      }
      // mind map growth: Tab = child, Enter = sibling of the selected node
      if (
        (e.key === 'Tab' || e.key === 'Enter') &&
        !meta &&
        selectionRef.current.length === 1
      ) {
        const sel = sceneRef.current[selectionRef.current[0]!];
        if (sel?.type === 'mindmap') {
          e.preventDefault();
          if (e.key === 'Tab') {
            mindmapAddChild(sel.id);
          } else {
            mindmapAddSibling(sel.id);
          }
          return;
        }
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === 'Escape') {
        setSelection([]);
        setEditing(null);
        return;
      }
      if (e.key.startsWith('Arrow') && selectionRef.current.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? GRID : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeSelection(dx, dy);
        return;
      }
      const map: Record<string, BoardTool> = {
        v: 'select',
        h: 'hand',
        s: 'sticky',
        r: 'rect',
        o: 'ellipse',
        d: 'diamond',
        t: 'text',
        c: 'connector',
        p: 'pen',
        f: 'frame',
        m: 'mindmap',
      };
      if (!meta && map[e.key.toLowerCase()]) {
        setTool(map[e.key.toLowerCase()]!);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canEdit]);

  // ----- selection operations ----------------------------------------------
  const deleteSelection = () => {
    // Elements hard-locked by others cannot be deleted.
    const ids = manipulableIds(selectionRef.current);
    if (ids.length === 0) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    for (const id of ids) {
      delete next[id];
    }
    setSelection([]);
    commit(before, next, ids);
  };

  const duplicateSelection = () => {
    const ids = selectionRef.current;
    if (ids.length === 0) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    const newIds: string[] = [];
    let z = topZ(sceneRef.current);
    for (const id of ids) {
      const el = sceneRef.current[id];
      if (!el) {
        continue;
      }
      const clone = createElement({
        type: el.type,
        x: el.x + GRID,
        y: el.y + GRID,
        w: el.w,
        h: el.h,
        z,
        style: { ...el.style },
        text: el.text,
        points: el.points?.map((pt) => [...pt]),
      });
      clone.rotation = el.rotation;
      next[clone.id] = clone;
      newIds.push(clone.id);
      z = topZ(next);
    }
    setSelection(newIds);
    commit(before, next, newIds);
  };

  const withFrameChildren = (ids: string[]): string[] => {
    const set = new Set(ids);
    for (const id of ids) {
      const el = sceneRef.current[id];
      if (el?.type === 'frame') {
        for (const cid of frameChildIds(sceneRef.current, id)) {
          set.add(cid);
        }
      }
    }
    return [...set];
  };

  const nudgeSelection = (dx: number, dy: number) => {
    if (selectionRef.current.length === 0) {
      return;
    }
    const ids = manipulableIds(withFrameChildren(selectionRef.current));
    if (ids.length === 0) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    for (const id of ids) {
      const el = next[id];
      if (el) {
        next[id] = { ...el, x: el.x + dx, y: el.y + dy };
      }
    }
    commit(before, next, ids);
  };

  // ----- mind map ----------------------------------------------------------
  // Grow the map (Tab = child, Enter = sibling) with a tidy re-layout, then
  // drop straight into inline edit on the fresh node.
  const mindmapAddChild = (id: string) => {
    const before = cloneScene(sceneRef.current);
    const res = addMindmapChild(sceneRef.current, id);
    if (!res) {
      return;
    }
    commit(before, res.scene, res.changedIds);
    setSelection([res.newId]);
    setEditing({ id: res.newId, value: '' });
  };

  const mindmapAddSibling = (id: string) => {
    const before = cloneScene(sceneRef.current);
    const res = addMindmapSibling(sceneRef.current, id);
    if (!res) {
      return;
    }
    commit(before, res.scene, res.changedIds);
    setSelection([res.newId]);
    setEditing({ id: res.newId, value: '' });
  };

  const mindmapToggleCollapse = (id: string) => {
    const before = cloneScene(sceneRef.current);
    const res = toggleMindmapCollapsed(sceneRef.current, id);
    if (res.changedIds.length === 0) {
      return;
    }
    commit(before, res.scene, res.changedIds);
  };

  // ----- quick-connect -----------------------------------------------------
  // Anchor the picker menu at the selected shape's edge midpoint (in screen
  // coords) for the chosen side, then let the user pick the new shape type.
  const openQuickConnect = (sourceId: string, side: QuickSide) => {
    const src = sceneRef.current[sourceId];
    if (!src) {
      return;
    }
    const ap = anchorPoint(elementRect(src), side);
    // The picker is portaled out of the board and positioned with
    // position:fixed, so anchor it in viewport coordinates (container-relative
    // screen point + the svg's page offset).
    const local = sceneToClient(ap);
    const rect = svgRef.current?.getBoundingClientRect();
    setQuickConnect({
      sourceId,
      side,
      screen: {
        x: local.x + (rect?.left ?? 0),
        y: local.y + (rect?.top ?? 0),
      },
    });
  };

  // Spawn a NEW shape on `side` of the source and auto-wire an arrow connector
  // between them, then drop straight into inline edit on the new shape.
  const createConnectedShape = (
    sourceId: string,
    side: QuickSide,
    type: BoardElementType
  ) => {
    const src = sceneRef.current[sourceId];
    if (!src) {
      return;
    }
    const def = defaultForType(type);
    const gap = 90;
    let x = src.x;
    let y = src.y;
    switch (side) {
      case 'right':
        x = src.x + src.w + gap;
        y = src.y + src.h / 2 - def.h / 2;
        break;
      case 'left':
        x = src.x - gap - def.w;
        y = src.y + src.h / 2 - def.h / 2;
        break;
      case 'top':
        x = src.x + src.w / 2 - def.w / 2;
        y = src.y - gap - def.h;
        break;
      case 'bottom':
        x = src.x + src.w / 2 - def.w / 2;
        y = src.y + src.h + gap;
        break;
    }
    const before = cloneScene(sceneRef.current);
    const newEl = createElement({
      type,
      x: maybeSnap(x),
      y: maybeSnap(y),
      z: topZ(sceneRef.current),
      style: styleForType(type as BoardTool),
      text: '',
    });
    const withNew = { ...sceneRef.current, [newEl.id]: newEl };
    const conn = createElement({
      type: 'connector',
      x: 0,
      y: 0,
      z: topZ(withNew),
      style: styleForType('connector'),
    });
    conn.connector = {
      fromId: sourceId,
      toId: newEl.id,
      arrowEnd: true,
      fromAnchor: side,
      toAnchor: OPPOSITE_SIDE[side],
    };
    const next = { ...withNew, [conn.id]: conn };
    setQuickConnect(null);
    commit(before, next, [newEl.id, conn.id]);
    setSelection([newEl.id]);
    setEditing({ id: newEl.id, value: '' });
  };

  // ----- per-element text sizing -------------------------------------------
  const applyFontToSelection = (
    mut: (style: BoardElementStyle) => BoardElementStyle
  ) => {
    const ids = selectionRef.current.filter((id) => {
      const el = sceneRef.current[id];
      return (
        !!el && TEXT_CAPABLE_TYPES.includes(el.type) && !isLockedForMe(id)
      );
    });
    if (ids.length === 0) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    for (const id of ids) {
      const el = next[id];
      if (!el) {
        continue;
      }
      next[id] = { ...el, style: mut(el.style) };
    }
    commit(before, next, ids);
  };

  const onFontDelta = (delta: number) => {
    applyFontToSelection((s) => ({
      ...s,
      fontAuto: false,
      fontSize: Math.max(8, Math.min(200, Math.round((s.fontSize ?? 15) + delta))),
    }));
  };

  const onFontAuto = (auto: boolean) => {
    applyFontToSelection((s) => ({ ...s, fontAuto: auto }));
  };

  // ----- insert a template into the current board --------------------------
  // Reuse a BOARD_TEMPLATE but drop it at the viewport center with fresh ids
  // and top-of-stack z keys so it never collides with existing elements.
  const insertTemplate = (templateId: string) => {
    const tpl = getTemplate(templateId);
    if (!tpl) {
      return;
    }
    const built = tpl.build();
    const elems = Object.values(built);
    if (elems.length === 0) {
      return;
    }
    const rects = elems.map((el) =>
      el.type === 'connector' || el.type === 'freehand'
        ? pointsBounds(el.points ?? [[el.x, el.y]])
        : elementRect(el)
    );
    const b = unionBounds(rects) ?? { x: 0, y: 0, w: 0, h: 0 };
    const cw = svgRef.current?.clientWidth ?? 800;
    const ch = svgRef.current?.clientHeight ?? 600;
    const vp = viewportRef.current;
    const center = {
      x: (cw / 2 - vp.x) / vp.zoom,
      y: (ch / 2 - vp.y) / vp.zoom,
    };
    const dx = center.x - (b.x + b.w / 2);
    const dy = center.y - (b.y + b.h / 2);

    const idMap: Record<string, string> = {};
    for (const el of elems) {
      idMap[el.id] = createElementId();
    }
    const orderedElems = [...elems].sort((a, c) =>
      a.z < c.z ? -1 : a.z > c.z ? 1 : 0
    );
    const zKeys = generateNKeysBetween(
      topZ(sceneRef.current),
      null,
      orderedElems.length
    );

    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    const newIds: string[] = [];
    orderedElems.forEach((el, i) => {
      const nid = idMap[el.id]!;
      const remapped: BoardElement = {
        ...el,
        id: nid,
        z: zKeys[i]!,
        x: el.x + dx,
        y: el.y + dy,
      };
      if (el.points) {
        remapped.points = el.points.map(([px, py]) => [
          (px ?? 0) + dx,
          (py ?? 0) + dy,
        ]);
      }
      if (el.frameId && idMap[el.frameId]) {
        remapped.frameId = idMap[el.frameId];
      }
      if (el.connector) {
        remapped.connector = {
          ...el.connector,
          fromId: el.connector.fromId
            ? idMap[el.connector.fromId] ?? el.connector.fromId
            : el.connector.fromId,
          toId: el.connector.toId
            ? idMap[el.connector.toId] ?? el.connector.toId
            : el.connector.toId,
        };
      }
      if (el.mindmap) {
        remapped.mindmap = {
          ...el.mindmap,
          parentId: el.mindmap.parentId
            ? idMap[el.mindmap.parentId] ?? el.mindmap.parentId
            : el.mindmap.parentId,
        };
      }
      next[nid] = remapped;
      newIds.push(nid);
    });
    commit(before, next, newIds);
    setSelection(newIds);
    setTool('select');
  };

  const onStyleChange = (patch: Partial<BoardStyleState>) => {
    setStyle((s) => ({ ...s, ...patch }));
    const ids = manipulableIds(selectionRef.current);
    if (ids.length === 0) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    for (const id of ids) {
      const el = next[id];
      if (!el) {
        continue;
      }
      const nextStyle: BoardElementStyle = { ...el.style };
      if (patch.fill !== undefined && el.type !== 'sticky') {
        nextStyle.fill = patch.fill;
      }
      if (patch.stickyColor !== undefined && el.type === 'sticky') {
        nextStyle.fill = patch.stickyColor;
      }
      if (patch.stroke !== undefined) {
        nextStyle.stroke = patch.stroke;
      }
      if (patch.strokeWidth !== undefined) {
        nextStyle.strokeWidth = patch.strokeWidth;
      }
      if (patch.strokeStyle !== undefined) {
        nextStyle.strokeStyle = patch.strokeStyle;
      }
      if (patch.opacity !== undefined) {
        nextStyle.opacity = patch.opacity;
      }
      next[id] = { ...el, style: nextStyle };
    }
    commit(before, next, ids);
  };

  // ----- connector routing (line shape) ------------------------------------
  // Routing lives on `el.connector`, NOT `el.style`, so it has its own updater
  // instead of overloading `onStyleChange`. Applies to every selected connector.
  const onConnectorRouting = (routing: ConnectorRouting) => {
    const ids = manipulableIds(selectionRef.current).filter(
      (id) => sceneRef.current[id]?.type === 'connector'
    );
    if (ids.length === 0) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    for (const id of ids) {
      const el = next[id];
      if (!el) {
        continue;
      }
      next[id] = { ...el, connector: { ...el.connector, routing } };
    }
    commit(before, next, ids);
  };

  // ----- image elements (drag-drop / paste) --------------------------------
  // Read an image file's natural size, scaled down to fit a ~480px cap so a
  // huge photo does not spawn a wall-sized element.
  const readImageSize = (file: File): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const cap = 480;
        const nw = img.naturalWidth || 240;
        const nh = img.naturalHeight || 180;
        const scale = Math.min(1, cap / Math.max(nw, nh));
        resolve({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ w: 240, h: 180 });
      };
      img.src = url;
    });

  // Persist each dropped/pasted image as a Colanode file node (temp file ->
  // file.create) and drop an `image` board element centred on `at` (scene
  // coords), cascading multiples so they do not stack exactly.
  const addImagesAt = async (files: File[], at: Point) => {
    if (!canEdit || embedded) {
      return;
    }
    let offset = 0;
    for (const file of files) {
      const dims = await readImageSize(file);
      const temp = await window.colanode.saveTempFile(file);
      const res = await window.colanode.executeMutation({
        type: 'file.create',
        userId: workspace.userId,
        tempFileId: temp.id,
        parentId: node.id,
      });
      if (!res.success) {
        toast.error(res.error.message);
        continue;
      }
      const fileId = res.output.id;
      if (!fileId) {
        toast.error('Could not attach image');
        continue;
      }
      const el = createElement({
        type: 'image',
        x: maybeSnap(at.x - dims.w / 2 + offset),
        y: maybeSnap(at.y - dims.h / 2 + offset),
        w: dims.w,
        h: dims.h,
        z: topZ(sceneRef.current),
        fileId,
      });
      const before = cloneScene(sceneRef.current);
      const next = { ...sceneRef.current, [el.id]: el };
      commit(before, next, [el.id]);
      setSelection([el.id]);
      offset += 16;
    }
  };

  // Paste images onto the board (Ctrl/Cmd+V) when the pointer is over it, so a
  // global paste elsewhere in the app is never hijacked. Drops at the viewport
  // centre (the clipboard carries no pointer position).
  useEffect(() => {
    if (!canEdit || embedded) {
      return;
    }
    const onPaste = (e: ClipboardEvent) => {
      const container = containerRef.current;
      if (!container || !container.matches(':hover')) {
        return;
      }
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length === 0) {
        return;
      }
      e.preventDefault();
      void addImagesAt(files, viewportCenterScene());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, embedded]);

  // ----- inline text editing ----------------------------------------------
  const commitEditing = () => {
    if (!editing) {
      return;
    }
    const el = sceneRef.current[editing.id];
    if (!el) {
      setEditing(null);
      return;
    }
    const before = cloneScene(sceneRef.current);
    const value = editing.value;
    if (el.type === 'text' && value.trim() === '') {
      const next = { ...sceneRef.current };
      delete next[editing.id];
      setEditing(null);
      setSelection([]);
      commit(before, next, [editing.id]);
      return;
    }
    const next = {
      ...sceneRef.current,
      [editing.id]: { ...el, text: value },
    };
    setEditing(null);
    commit(before, next, [editing.id]);
  };

  const onElementDoubleClick = (id: string) => {
    const el = sceneRef.current[id];
    if (!el) {
      return;
    }
    // A nodeCard double-click opens the referenced node (works for viewers too)
    // instead of entering text-edit - the card carries no free text of its own.
    if (el.type === 'nodeCard') {
      if (el.nodeId) {
        navigate({
          to: '/workspace/$userId/$nodeId',
          params: { userId: workspace.userId, nodeId: el.nodeId },
        });
      }
      return;
    }
    if (!canEdit) {
      return;
    }
    if (
      el.type === 'connector' ||
      el.type === 'freehand' ||
      el.type === 'image'
    ) {
      return;
    }
    if (isLockedForMe(id)) {
      toast(`\uD83D\uDD12 Element locked \u2014 unlock it to edit`);
      return;
    }
    const lockedBy = remoteEditing.get(id);
    if (lockedBy) {
      toast(`\uD83D\uDD12 ${lockedBy} is editing this element`);
      return;
    }
    setSelection([id]);
    setEditing({ id, value: el.text ?? '' });
  };

  // ----- export ------------------------------------------------------------
  // Region (scene coords) every export shares: the selected frame if one is
  // selected, otherwise the whole scene, padded.
  const computeExportRegion = (): {
    group: SVGGElement;
    region: Rect;
  } | null => {
    const group = sceneGroupRef.current;
    if (!group) {
      return null;
    }
    const els = Object.values(sceneRef.current);
    const selFrame = els.find(
      (el) => el.type === 'frame' && selection.includes(el.id)
    );
    const rects = (selFrame ? [selFrame] : els).map((el) =>
      el.type === 'connector' || el.type === 'freehand'
        ? pointsBounds(el.points ?? [[el.x, el.y]])
        : elementRect(el)
    );
    const bounds = unionBounds(rects) ?? { x: 0, y: 0, w: 800, h: 600 };
    const pad = 40;
    return {
      group,
      region: {
        x: bounds.x - pad,
        y: bounds.y - pad,
        w: bounds.w + pad * 2,
        h: bounds.h + pad * 2,
      },
    };
  };

  const boardFileName = () =>
    ('name' in node ? node.name : '') || 'board';

  const onExport = async () => {
    const target = computeExportRegion();
    if (!target) {
      return;
    }
    try {
      const blob = await exportScenePng(target.group, target.region, {
        scale: 2,
      });
      downloadBlob(blob, `${boardFileName()}.png`);
    } catch {
      // ignore export failures (e.g. tainted canvas)
    }
  };

  const onExportSvg = () => {
    const target = computeExportRegion();
    if (!target) {
      return;
    }
    try {
      exportSceneSvg(target.group, target.region, `${boardFileName()}.svg`);
    } catch {
      // ignore export failures
    }
  };

  const onExportPdf = () => {
    const target = computeExportRegion();
    if (!target) {
      return;
    }
    try {
      const svgString = buildSceneSvgString(target.group, target.region);
      printHtmlDocument({ title: boardFileName(), bodyHtml: svgString });
    } catch {
      // ignore export failures
    }
  };

  // ----- rendering ---------------------------------------------------------
  const hiddenIds = useMemo(() => mindmapHiddenIds(scene), [scene]);
  const mindEdges = useMemo(() => mindmapEdges(scene), [scene]);
  const ordered = useMemo(
    () => sortedElements(scene).filter((el) => !hiddenIds.has(el.id)),
    [scene, hiddenIds]
  );
  const it = interactionRef.current;
  const marquee =
    it?.mode === 'marquee'
      ? normalizeRect({
          x: it.start.x,
          y: it.start.y,
          w: it.current.x - it.start.x,
          h: it.current.y - it.start.y,
        })
      : null;

  const selectionRects = selection
    .map((id) => scene[id])
    .filter((el): el is BoardElement => Boolean(el) && !hiddenIds.has(el!.id))
    .map((el) => ({ el, rect: elementRect(el) }));

  const gridSize = GRID;
  const cursor =
    tool === 'hand'
      ? 'grab'
      : tool === 'select'
        ? 'default'
        : 'crosshair';

  const editingEl = editing ? scene[editing.id] : null;
  const editingScreen = editingEl
    ? sceneToClient({ x: editingEl.x, y: editingEl.y })
    : null;

  // Text-sizing controls reflect the first selected text-bearing element.
  const selectedTextEls = selection
    .map((id) => scene[id])
    .filter(
      (el): el is BoardElement =>
        Boolean(el) && TEXT_CAPABLE_TYPES.includes(el!.type)
    );
  const fontControlsVisible = canEdit && selectedTextEls.length > 0;
  const fontAutoState = selectedTextEls[0]?.style.fontAuto ?? false;
  const fontSizeState = selectedTextEls[0]?.style.fontSize ?? 15;

  // The single selected shape that should show quick-connect "+" handles.
  const quickConnectSource =
    canEdit && selection.length === 1
      ? (() => {
          const el = scene[selection[0]!];
          if (
            !el ||
            el.type === 'connector' ||
            el.type === 'freehand' ||
            hiddenIds.has(el.id)
          ) {
            return null;
          }
          return el;
        })()
      : null;

  // Connector context: the selection is one-or-more connectors (and nothing
  // else). Drives the toolbar's routing toggle; `singleConnector` additionally
  // gates the on-canvas reshape handle (only one bend handle at a time).
  const selectedConnectors = selection
    .map((id) => scene[id])
    .filter(
      (el): el is BoardElement => Boolean(el) && el!.type === 'connector'
    );
  const connectorContext =
    canEdit &&
    selectedConnectors.length > 0 &&
    selectedConnectors.length === selection.length;
  const connectorRouting: ConnectorRouting =
    selectedConnectors[0]?.connector?.routing ?? 'straight';
  const singleConnector =
    canEdit &&
    selection.length === 1 &&
    selectedConnectors.length === 1 &&
    !(
      selectedConnectors[0]!.locked &&
      selectedConnectors[0]!.lockedBy !== workspace.userId
    )
      ? selectedConnectors[0]!
      : null;

  // Every selected element is hard-locked -> the toggle shows "unlock".
  const selectionLocked =
    selection.length > 0 && selection.every((id) => !!scene[id]?.locked);

  // Locked elements (whatever their owner) get a small lock badge.
  const lockedElements = ordered.filter((el) => el.locked);

  // One row per remote user for the follow menu (a user with several devices
  // shows once). The active follow target's name drives the banner.
  const followUsers: { userId: string; name: string; color: string }[] = [];
  const seenFollowUsers = new Set<string>();
  for (const p of presences) {
    if (seenFollowUsers.has(p.userId)) {
      continue;
    }
    seenFollowUsers.add(p.userId);
    followUsers.push({
      userId: p.userId,
      name: p.name || 'Anonymous',
      color: p.color,
    });
  }
  const followedName = followUserId
    ? (followUsers.find((u) => u.userId === followUserId)?.name ?? null)
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-muted/30"
      onDragOver={
        canEdit && !embedded ? (e) => e.preventDefault() : undefined
      }
      onDrop={
        canEdit && !embedded
          ? (e) => {
              const files = Array.from(e.dataTransfer?.files ?? []).filter(
                (f) => f.type.startsWith('image/')
              );
              if (files.length === 0) {
                return;
              }
              e.preventDefault();
              void addImagesAt(files, clientToScene(e.clientX, e.clientY));
            }
          : undefined
      }
    >
      <svg
        ref={svgRef}
        // `touch-none` lets the board own touch gestures (pan/zoom). In an
        // in-page embed that would trap the finger, so drop it there and let
        // touch scroll the page past the preview.
        className={cn('h-full w-full select-none', !embedded && 'touch-none')}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const target = e.target as Element;
          // Never let a double-click on an overlay affordance (quick-connect
          // "+", resize/rotate handle, mindmap "+", collapse badge) fall through
          // to shape creation — the pointer-down already handled those.
          if (
            target.closest(
              '[data-quick],[data-handle],[data-mindadd],[data-collapse]'
            )
          ) {
            return;
          }
          const elEl = target.closest('[data-el-id]');
          if (elEl) {
            onElementDoubleClick(elEl.getAttribute('data-el-id')!);
            return;
          }
          // The pointer-capture set on pointer-down (and the screen-space
          // selection overlay painted over the shape) can retarget the dblclick
          // off the shape's <g>, so hit-test the scene at the cursor before
          // treating this as an empty-canvas double-click. Double-clicking an
          // existing shape must edit its text, not spawn a new one.
          const p = clientToScene(e.clientX, e.clientY);
          const hit = elementAt(p);
          if (hit) {
            onElementDoubleClick(hit.id);
          } else if (canEdit && tool === 'select') {
            placeClickElement('text', p);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern
            id={`board-grid-${node.id}`}
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={1} fill="currentColor" opacity={0.25} />
          </pattern>
        </defs>

        <g
          ref={sceneGroupRef}
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
        >
          <rect
            className="board-no-export text-muted-foreground"
            x={-viewport.x / viewport.zoom - 2000}
            y={-viewport.y / viewport.zoom - 2000}
            width={
              (svgRef.current?.clientWidth ?? 2000) / viewport.zoom + 4000
            }
            height={
              (svgRef.current?.clientHeight ?? 2000) / viewport.zoom + 4000
            }
            fill={`url(#board-grid-${node.id})`}
          />

          {/* mind-map parent -> child edges (behind the nodes) */}
          <g style={{ pointerEvents: 'none' }}>
            {mindEdges.map((edge) => {
              const from = {
                x: edge.from.x + edge.from.w,
                y: edge.from.y + edge.from.h / 2,
              };
              const to = { x: edge.to.x, y: edge.to.y + edge.to.h / 2 };
              const midX = (from.x + to.x) / 2;
              return (
                <path
                  key={edge.id}
                  d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={2}
                />
              );
            })}
          </g>

          {ordered.map((el) => (
            <g
              key={el.id}
              data-el-id={el.id}
              style={{ cursor: canEdit ? 'move' : 'default' }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (suppressContextMenuRef.current) {
                  suppressContextMenuRef.current = false;
                  return;
                }
                if (canComment) {
                  setCommentElementId(el.id);
                }
              }}
            >
              <BoardElementView
                element={el}
                scene={scene}
                editing={editing?.id === el.id}
                canEdit={canEdit}
              />
              <ElementHitArea element={el} scene={scene} />
            </g>
          ))}

          {/* collapse toggles on mind-map nodes that have children */}
          {canEdit &&
            ordered
              .filter(
                (el) =>
                  el.type === 'mindmap' && hasMindmapChildren(scene, el.id)
              )
              .map((el) => {
                const cx = el.x + el.w;
                const cy = el.y + el.h / 2;
                const collapsed = el.mindmap?.collapsed;
                return (
                  <g
                    key={`collapse-${el.id}`}
                    className="board-no-export"
                    data-collapse={el.id}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill="#fff"
                      stroke="#6366f1"
                      strokeWidth={1.5}
                    />
                    <line
                      x1={cx - 4}
                      y1={cy}
                      x2={cx + 4}
                      y2={cy}
                      stroke="#6366f1"
                      strokeWidth={1.5}
                    />
                    {collapsed && (
                      <line
                        x1={cx}
                        y1={cy - 4}
                        x2={cx}
                        y2={cy + 4}
                        stroke="#6366f1"
                        strokeWidth={1.5}
                      />
                    )}
                  </g>
                );
              })}

          {/* mind-map "+" affordance: add a child to the selected node */}
          {canEdit &&
            ordered
              .filter(
                (el) => el.type === 'mindmap' && selection.includes(el.id)
              )
              .map((el) => {
                const cx = el.x + el.w + 20;
                const cy = el.y + el.h / 2;
                return (
                  <g
                    key={`mindadd-${el.id}`}
                    className="board-no-export"
                    data-mindadd={el.id}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>Add child node</title>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={9}
                      fill="#6366f1"
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                    <line
                      x1={cx - 4}
                      y1={cy}
                      x2={cx + 4}
                      y2={cy}
                      stroke="#fff"
                      strokeWidth={1.75}
                    />
                    <line
                      x1={cx}
                      y1={cy - 4}
                      x2={cx}
                      y2={cy + 4}
                      stroke="#fff"
                      strokeWidth={1.75}
                    />
                  </g>
                );
              })}
        </g>

        {/* selection + handles in screen space (excluded from export) */}
        <g className="board-overlay">
          {selectionRects.map(({ el, rect }) => {
            const tl = sceneToClient({ x: rect.x, y: rect.y });
            const w = rect.w * viewport.zoom;
            const h = rect.h * viewport.zoom;
            const center = { x: tl.x + w / 2, y: tl.y + h / 2 };
            const rot = el.rotation ?? 0;
            return (
              <g
                key={`sel-${el.id}`}
                transform={`rotate(${rot} ${center.x} ${center.y})`}
              >
                <rect
                  x={tl.x}
                  y={tl.y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                />
                {canEdit &&
                  selection.length === 1 &&
                  el.type !== 'connector' &&
                  el.type !== 'freehand' &&
                  !(el.locked && el.lockedBy !== workspace.userId) && (
                    <>
                      {RESIZE_HANDLES.map((handle) => {
                        const hp = handlePoint(tl, w, h, handle);
                        return (
                          <rect
                            key={handle}
                            data-handle={handle}
                            x={hp.x - 5}
                            y={hp.y - 5}
                            width={10}
                            height={10}
                            rx={2}
                            fill="#fff"
                            stroke="#3b82f6"
                            strokeWidth={1.5}
                            style={{ cursor: 'pointer' }}
                          />
                        );
                      })}
                      <line
                        x1={tl.x + w / 2}
                        y1={tl.y}
                        x2={tl.x + w / 2}
                        y2={tl.y - 24}
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                      />
                      <circle
                        data-handle="rotate"
                        cx={tl.x + w / 2}
                        cy={tl.y - 24}
                        r={6}
                        fill="#fff"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        style={{ cursor: 'grab' }}
                      />
                    </>
                  )}
              </g>
            );
          })}

          {/* connector reshape handle: drag to move the elbow corner / curve
              control point (works for all three routings). */}
          {singleConnector &&
            (() => {
              const { start, end } = resolveConnectorEndpoints(
                singleConnector,
                scene
              );
              const c = singleConnector.connector ?? {};
              const routing = c.routing ?? 'straight';
              const bends = connectorBendPoints(c.bends, c.bend);
              // No bends yet: one midpoint handle the user can drag to create
              // the first bend (preserves the legacy single-handle UX).
              if (bends.length === 0) {
                const sp = sceneToClient(
                  connectorHandlePoint(routing, start, end, [])
                );
                return (
                  <circle
                    data-connector-handle={singleConnector.id}
                    data-bend-index="new"
                    cx={sp.x}
                    cy={sp.y}
                    r={6}
                    fill="#fff"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    style={{ cursor: 'grab' }}
                  />
                );
              }
              // One draggable handle per bend. Ctrl/Cmd+right-click removes it.
              return (
                <>
                  {bends.map((bpt, i) => {
                    const sp = sceneToClient(bpt);
                    return (
                      <circle
                        key={i}
                        data-connector-handle={singleConnector.id}
                        data-bend-index={i}
                        cx={sp.x}
                        cy={sp.y}
                        r={6}
                        fill="#fff"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        style={{ cursor: 'grab' }}
                      />
                    );
                  })}
                </>
              );
            })()}

          {/* quick-connect "+" handles around the single selected shape */}
          {quickConnectSource &&
            (() => {
              const rect = elementRect(quickConnectSource);
              const tl = sceneToClient({ x: rect.x, y: rect.y });
              const w = rect.w * viewport.zoom;
              const h = rect.h * viewport.zoom;
              const cx = tl.x + w / 2;
              const cy = tl.y + h / 2;
              const side = 22;
              // top uses a larger offset to clear the rotation grip above the box
              const handles: Array<{ side: QuickSide; x: number; y: number }> = [
                { side: 'top', x: cx, y: tl.y - 44 },
                { side: 'right', x: tl.x + w + side, y: cy },
                { side: 'bottom', x: cx, y: tl.y + h + side },
                { side: 'left', x: tl.x - side, y: cy },
              ];
              return handles.map((hd) => (
                <g
                  key={`quick-${hd.side}`}
                  data-quick={hd.side}
                  style={{ cursor: 'pointer' }}
                >
                  <title>Add connected shape</title>
                  <circle
                    cx={hd.x}
                    cy={hd.y}
                    r={9}
                    fill="#fff"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                  />
                  <line
                    x1={hd.x - 4}
                    y1={hd.y}
                    x2={hd.x + 4}
                    y2={hd.y}
                    stroke="#3b82f6"
                    strokeWidth={1.75}
                  />
                  <line
                    x1={hd.x}
                    y1={hd.y - 4}
                    x2={hd.x}
                    y2={hd.y + 4}
                    stroke="#3b82f6"
                    strokeWidth={1.75}
                  />
                </g>
              ));
            })()}

          {marquee && (
            <rect
              x={sceneToClient({ x: marquee.x, y: marquee.y }).x}
              y={sceneToClient({ x: marquee.x, y: marquee.y }).y}
              width={marquee.w * viewport.zoom}
              height={marquee.h * viewport.zoom}
              fill="rgba(59,130,246,0.08)"
              stroke="#3b82f6"
              strokeDasharray="4 3"
              strokeWidth={1}
            />
          )}

          {/* Smart alignment guides shown while dragging. */}
          {alignGuides.map((g, i) => {
            if (g.axis === 'x') {
              const a = sceneToClient({ x: g.pos, y: g.from });
              const b = sceneToClient({ x: g.pos, y: g.to });
              return (
                <line
                  key={`guide-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#f43f5e"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  pointerEvents="none"
                />
              );
            }
            const a = sceneToClient({ x: g.from, y: g.pos });
            const b = sceneToClient({ x: g.to, y: g.pos });
            return (
              <line
                key={`guide-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#f43f5e"
                strokeWidth={1}
                strokeDasharray="4 2"
                pointerEvents="none"
              />
            );
          })}

          {/* Connector anchor hover feedback: dots on the shape being linked. */}
          {linkHoverId &&
            scene[linkHoverId] &&
            (['top', 'right', 'bottom', 'left'] as Anchor[]).map((an) => {
              const pt = anchorPoint(elementRect(scene[linkHoverId]!), an);
              const sp = sceneToClient(pt);
              return (
                <circle
                  key={`anchor-${an}`}
                  cx={sp.x}
                  cy={sp.y}
                  r={5}
                  fill="#fff"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              );
            })}

          {/* Hard-lock badge on every locked element (screen space, constant
              size). Owned-by-me locks are tinted in the primary colour, locks
              held by others in slate. */}
          {lockedElements.map((el) => {
            const rect = elementRect(el);
            const tr = sceneToClient({ x: rect.x + rect.w, y: rect.y });
            const mine = el.lockedBy === workspace.userId;
            return (
              <g key={`lock-${el.id}`} pointerEvents="none">
                <circle
                  cx={tr.x - 9}
                  cy={tr.y + 9}
                  r={9}
                  fill={mine ? '#3b82f6' : '#334155'}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  opacity={0.95}
                />
                <text
                  x={tr.x - 9}
                  y={tr.y + 9}
                  fontSize={10}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ userSelect: 'none' }}
                >
                  {'🔒'}
                </text>
              </g>
            );
          })}

          {/* Comment pins (screen space): one amber badge per element that has
              at least one comment thread; clicking opens that element's
              thread panel. */}
          {Array.from(commentCounts.entries()).map(([elId, cnt]) => {
            const el = scene[elId];
            if (!el || hiddenIds.has(elId)) {
              return null;
            }
            const rect = elementRect(el);
            const tl = sceneToClient({ x: rect.x, y: rect.y });
            const cx = tl.x + 12;
            const cy = tl.y - 12;
            return (
              <g
                key={`cmt-${elId}`}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setCommentElementId(elId);
                }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={10}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  opacity={0.95}
                />
                <text
                  x={cx}
                  y={cy}
                  fontSize={11}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ffffff"
                  style={{ userSelect: 'none' }}
                >
                  {cnt > 9 ? '9+' : cnt}
                </text>
              </g>
            );
          })}
        </g>

        {/* remote collaborators' pointers + selections */}
        <BoardPresenceLayer
          presences={presences}
          viewport={viewport}
          scene={scene}
        />

        {/* ephemeral live reactions + laser dots (scene space, not exported) */}
        <g
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
          style={{ pointerEvents: 'none' }}
        >
          {reactions.map((r) => (
            <g key={r.key} transform={`translate(${r.x} ${r.y})`}>
              <g>
                <text
                  fontSize={28}
                  textAnchor="middle"
                  style={{ userSelect: 'none' }}
                >
                  {r.emoji}
                </text>
                {r.name && (
                  <text
                    fontSize={11}
                    y={16}
                    textAnchor="middle"
                    fill="#64748b"
                    style={{ userSelect: 'none' }}
                  >
                    {r.name}
                  </text>
                )}
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from="0 0"
                  to="0 -70"
                  dur="2.4s"
                  fill="freeze"
                />
                <animate
                  attributeName="opacity"
                  from="1"
                  to="0"
                  dur="2.4s"
                  fill="freeze"
                />
              </g>
            </g>
          ))}

          {presences.map((p) => {
            const l = p.payload.laser;
            if (!l || Date.now() - l.at > LASER_TTL) {
              return null;
            }
            const r = 7 / viewport.zoom;
            return (
              <g key={`laser-${p.userId}:${p.deviceId}`}>
                <circle cx={l.x} cy={l.y} r={r * 2.4} fill={p.color} opacity={0.2} />
                <circle
                  cx={l.x}
                  cy={l.y}
                  r={r}
                  fill={p.color}
                  stroke="#ffffff"
                  strokeWidth={r * 0.4}
                />
              </g>
            );
          })}

          {laserActive && localLaser && (
            <g>
              <circle
                cx={localLaser.x}
                cy={localLaser.y}
                r={(7 / viewport.zoom) * 2.4}
                fill={myColor}
                opacity={0.2}
              />
              <circle
                cx={localLaser.x}
                cy={localLaser.y}
                r={7 / viewport.zoom}
                fill={myColor}
                stroke="#ffffff"
                strokeWidth={(7 / viewport.zoom) * 0.4}
              />
            </g>
          )}
        </g>
      </svg>

      <BoardToolbar
        tool={tool}
        onToolChange={setTool}
        style={style}
        onStyleChange={onStyleChange}
        hasSelection={selection.length > 0}
        selectionLocked={selectionLocked}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        readOnly={!canEdit}
        onUndo={undo}
        onRedo={redo}
        onDelete={deleteSelection}
        onDuplicate={duplicateSelection}
        onToggleLock={toggleLockSelection}
        onExport={onExport}
        onExportSvg={onExportSvg}
        onExportPdf={onExportPdf}
        onInsertTemplate={insertTemplate}
        fontControlsVisible={fontControlsVisible}
        fontAuto={fontAutoState}
        fontSize={fontSizeState}
        onFontDelta={onFontDelta}
        onFontAuto={onFontAuto}
        connectorContext={connectorContext}
        connectorRouting={connectorRouting}
        onConnectorRouting={onConnectorRouting}
        onComment={() => {
          const id = selection[0];
          if (id) {
            setCommentElementId(id);
          }
        }}
        commentEnabled={canComment && selection.length === 1}
      />

      {commentElementId && scene[commentElementId] && (
        <BoardCommentsPanel
          whiteboardId={node.id}
          rootId={node.rootId}
          role={role}
          elementId={commentElementId}
          onClose={() => setCommentElementId(null)}
        />
      )}

      {showCollabControls && presences.length > 0 && (
        <div className="absolute right-2 top-2 z-20 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setFollowMenuOpen((o) => !o)}
            className="rounded-full bg-background/80 p-0.5 shadow-sm backdrop-blur transition hover:bg-background"
            title="View / follow collaborators"
          >
            <PresenceAvatars presences={presences} />
          </button>
          {followMenuOpen && (
            <div className="w-56 rounded-lg border border-border bg-background p-1 shadow-xl">
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Collaborators
              </p>
              {followUsers.map((u) => {
                const active = followUserId === u.userId;
                return (
                  <div
                    key={u.userId}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: u.color }}
                    />
                    <span className="flex-1 truncate text-xs">{u.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFollowUserId(active ? null : u.userId);
                        setFollowMenuOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-2 py-1 text-[11px]',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Eye className="size-3" />
                      {active ? 'Following' : 'Follow'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* follow-mode banner */}
      {followedName && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
          <Eye className="size-3.5 text-primary" />
          <span>
            You&apos;re following <strong>{followedName}</strong>
          </span>
          <button
            type="button"
            onClick={() => setFollowUserId(null)}
            className="ml-1 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
            Stop
          </button>
        </div>
      )}

      {/* inline text editor */}
      {editing && editingEl && editingScreen && (
        <textarea
          ref={(node) => node?.focus()}
          className="absolute z-30 resize-none rounded-md border border-primary bg-background p-1 text-foreground shadow-lg outline-none"
          style={{
            left: editingScreen.x,
            top: editingScreen.y,
            width: Math.max(80, editingEl.w * viewport.zoom),
            height: Math.max(32, editingEl.h * viewport.zoom),
            fontSize: (editingEl.style.fontSize ?? 16) * viewport.zoom,
          }}
          value={editing.value}
          onChange={(e) => setEditing({ id: editing.id, value: e.target.value })}
          onBlur={commitEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitEditing();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(null);
            }
            e.stopPropagation();
          }}
        />
      )}

      {/* quick-connect shape-type picker (portaled so it escapes the board's
          overflow-hidden container and stays visible in fullscreen) */}
      {quickConnect &&
        canEdit &&
        createPortal(
        <div
          className="fixed z-[61] flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-xl"
          style={{
            left: quickConnect.screen.x,
            top: quickConnect.screen.y,
            transform:
              quickConnect.side === 'right'
                ? 'translate(14px, -50%)'
                : quickConnect.side === 'left'
                  ? 'translate(calc(-100% - 14px), -50%)'
                  : quickConnect.side === 'top'
                    ? 'translate(-50%, calc(-100% - 14px))'
                    : 'translate(-50%, 14px)',
          }}
        >
          {(
            [
              { type: 'sticky', icon: StickyNote, label: 'Sticky' },
              { type: 'rect', icon: Square, label: 'Rectangle' },
              { type: 'ellipse', icon: Circle, label: 'Ellipse' },
              { type: 'diamond', icon: Diamond, label: 'Diamond' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.type}
              type="button"
              title={`Add ${opt.label}`}
              aria-label={`Add ${opt.label}`}
              onClick={() =>
                createConnectedShape(
                  quickConnect.sourceId,
                  quickConnect.side,
                  opt.type
                )
              }
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <opt.icon className="size-4" />
            </button>
          ))}
        </div>,
          boardPortalTarget()
        )}

      {/* bottom-right controls */}
      <div className="absolute bottom-16 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
        {showCollabControls && (
          <>
            <button
              type="button"
              onClick={() => {
                setLaserActive((a) => !a);
                setLocalLaser(null);
              }}
              className={cn(
                'flex size-7 items-center justify-center rounded-md hover:bg-accent',
                laserActive && 'bg-primary/10 text-primary'
              )}
              title="Laser pointer (broadcast live)"
            >
              <Radio className="size-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setReactionMenuOpen((o) => !o)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md hover:bg-accent',
                  reactionMenuOpen && 'bg-primary/10 text-primary'
                )}
                title="Reaction"
              >
                <Smile className="size-4" />
              </button>
              {reactionMenuOpen && (
                <div className="absolute bottom-9 right-0 flex gap-0.5 rounded-lg border border-border bg-background p-1 shadow-xl">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        emitReaction(emoji);
                        setReactionMenuOpen(false);
                      }}
                      className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mx-0.5 h-5 w-px bg-border" />
          </>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setSnapEnabled((s) => !s)}
            className={cn(
              'rounded-md px-2 py-1 text-xs',
              snapEnabled ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            )}
            title="Toggle snap to grid"
          >
            Snap
          </button>
        )}
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
          title="Zoom out"
          onClick={() => {
            cancelFollow();
            setViewport((v) => ({
              ...v,
              zoom: Math.max(MIN_ZOOM, v.zoom / 1.2),
            }));
          }}
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className="min-w-12 rounded-md px-1 text-xs hover:bg-accent"
          title="Reset zoom"
          onClick={() => {
            cancelFollow();
            setViewport({ x: 0, y: 0, zoom: 1 });
          }}
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
          title="Zoom in"
          onClick={() => {
            cancelFollow();
            setViewport((v) => ({
              ...v,
              zoom: Math.min(MAX_ZOOM, v.zoom * 1.2),
            }));
          }}
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
          title="Zoom to fit"
          onClick={() => fitToContent()}
        >
          <Maximize className="size-4" />
        </button>
        {!embedded && (
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Shrink className="size-4" />
            ) : (
              <Expand className="size-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );

  function fitToContent() {
    cancelFollow();
    const els = Object.values(sceneRef.current);
    if (els.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const rects = els.map((el) =>
      el.type === 'connector' || el.type === 'freehand'
        ? pointsBounds(el.points ?? [[el.x, el.y]])
        : elementRect(el)
    );
    const b = unionBounds(rects);
    if (!b) {
      return;
    }
    const cw = svgRef.current?.clientWidth ?? 800;
    const ch = svgRef.current?.clientHeight ?? 600;
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(cw / (b.w + 120), ch / (b.h + 120)))
    );
    setViewport({
      x: cw / 2 - (b.x + b.w / 2) * zoom,
      y: ch / 2 - (b.y + b.h / 2) * zoom,
      zoom,
    });
  }
};

// Transparent hit area so shapes (even unfilled) and thin connectors are
// clickable across their whole bounds / stroke.
const ElementHitArea = ({
  element,
  scene,
}: {
  element: BoardElement;
  scene: BoardScene;
}) => {
  // A nodeCard already provides its own hit surface: an opaque background
  // rect plus a full-cover foreignObject (drag header + live page editor),
  // both of which bubble to the parent <g data-el-id>. A transparent hit
  // rect painted on top would sit above that foreignObject and swallow the
  // editor's pointer events, so nodeCards opt out of the shared hit area.
  if (element.type === 'nodeCard') {
    return null;
  }
  if (element.type === 'connector') {
    const { start, end } = resolveConnectorEndpoints(element, scene);
    const c = element.connector ?? {};
    return (
      <path
        d={buildConnectorPath(
          c.routing ?? 'straight',
          start,
          end,
          connectorBendPoints(c.bends, c.bend)
        )}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        strokeLinecap="round"
      />
    );
  }
  if (element.type === 'freehand') {
    const pts = element.points ?? [];
    if (pts.length < 2) {
      return null;
    }
    return (
      <polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
    );
  }
  return (
    <rect
      x={element.x}
      y={element.y}
      width={element.w}
      height={element.h}
      fill="transparent"
    />
  );
};

const handlePoint = (
  tl: Point,
  w: number,
  h: number,
  handle: ResizeHandle
): Point => {
  const x =
    handle.includes('w') ? tl.x : handle.includes('e') ? tl.x + w : tl.x + w / 2;
  const y =
    handle.includes('n') ? tl.y : handle.includes('s') ? tl.y + h : tl.y + h / 2;
  return { x, y };
};
