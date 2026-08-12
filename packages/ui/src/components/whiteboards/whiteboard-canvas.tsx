import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  Copy,
  Diamond,
  Expand,
  Eye,
  Group,
  ImageDown,
  Lock,
  LockOpen,
  Maximize,
  MessageSquare,
  Minus,
  Plus,
  Radio,
  Shrink,
  Smile,
  Square,
  StickyNote,
  Trash2,
  Ungroup,
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
import { BoardCommentsPanel } from '@colanode/ui/components/whiteboards/board/board-comments-panel';
import { BoardElementView } from '@colanode/ui/components/whiteboards/board/board-element';
import { BoardLayers } from '@colanode/ui/components/whiteboards/board/board-layers';
import { BoardMiroImportDialog } from '@colanode/ui/components/whiteboards/board/board-miro-import';
import { BoardPresenceLayer } from '@colanode/ui/components/whiteboards/board/board-presence-layer';
import { BoardShortcutsDialog } from '@colanode/ui/components/whiteboards/board/board-shortcuts';
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
import { readCustomColors } from '@colanode/ui/lib/board/custom-colors';
import {
  createElement,
  createElementId,
  defaultForType,
  elementRect,
  frameChildIds,
  frameOrder,
  resolveConnectorEndpoints,
  zKeyForStep,
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
  moveConnectorSegment,
  nearestSegmentIndex,
  normalizeRect,
  pointInRotatedRect,
  pointsBounds,
  polylineHitTest,
  Rect,
  rectCenter,
  rectsIntersect,
  resizeRect,
  ResizeHandle,
  RESIZE_HANDLES,
  snap,
  unionBounds,
  fractionalAnchor,
  anchorSide,
} from '@colanode/ui/lib/board/geometry';
import {
  addMindmapChild,
  addMindmapSibling,
  hasMindmapChildren,
  mindmapDirection as mindmapDirectionOf,
  mindmapEdgePath,
  canReparentMindmap,
  mindmapEdges,
  mindmapHiddenIds,
  reparentMindmap,
  setMindmapDirection,
  toggleMindmapCollapsed,
} from '@colanode/ui/lib/board/mindmap';
import {
  buildSceneSvgString,
  downloadBlob,
  exportScenePng,
  exportSceneSvg,
} from '@colanode/ui/lib/board/png';
import { getTemplate } from '@colanode/ui/lib/board/templates';
import { presenceColor } from '@colanode/ui/lib/presence';
import { printHtmlDocument } from '@colanode/ui/lib/print';
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
// Grid dot colour, fixed rather than themed: the board surface is white in
// both themes, so the dots have one job and one background.
const GRID_DOT = '#64748b';
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
  // Dragging one END of an existing connector to re-attach it.
  | {
      mode: 'connector-endpoint';
      id: string;
      end: 'from' | 'to';
      before: BoardScene;
    }
  | {
      mode: 'connector-segment';
      id: string;
      index: number;
      start: Point;
      // Waypoints captured when the segment was grabbed. The move is always
      // recomputed from THIS polyline, so a wandering pointer cannot compound
      // its own output drag after drag.
      pts: Point[];
      before: BoardScene;
    }
  | { mode: 'pen'; id: string; before: BoardScene }
  // One gesture, one undo step: every stroke rubbed out between press and
  // release is removed together.
  | { mode: 'erase'; before: BoardScene; removed: string[] };

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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // The group the user has "entered" (double-clicked into) to edit its members
  // individually; null means groups select as a whole.
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
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
  const activeGroupRef = useRef<string | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  // Set on a Ctrl/Cmd+right-click we handled ourselves (add/remove bend) so
  // the element's onContextMenu does not also open a comment popup.
  const suppressContextMenuRef = useRef(false);
  // Where a right-button press started, so a release that has travelled can
  // be told from a click that has not. A pan must not end with a menu.
  const rightDragRef = useRef<{ x: number; y: number } | null>(null);
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
  activeGroupRef.current = activeGroup;
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
        it.mode === 'connector-endpoint' ||
        it.mode === 'connector-segment' ||
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
  /**
   * Someone else's private element: dropped as it arrives rather than filtered
   * at render time, so it is not merely invisible — it is not in this client's
   * scene at all, and cannot be selected, moved or exported by accident.
   *
   * Safe because persistence is per-element: `persistIds` starts from the
   * server's current draft and writes only the ids it is given, so a client
   * that never saw these cannot delete them.
   */
  const hiddenFromMe = useCallback(
    (el: BoardElement | undefined): boolean =>
      !!el?.privateBy && el.privateBy !== workspace.userId,
    [workspace.userId]
  );

  useEffect(() => {
    const raw = getSceneAttr(node, sceneField) ?? {};
    const incoming: BoardScene = {};
    for (const [id, el] of Object.entries(raw)) {
      if (!hiddenFromMe(el)) {
        incoming[id] = el;
      }
    }
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
      if (!allLocked) {
        setSelection([]);
      }
      commit(before, next, changed);
    }
  };

  // Move the selection to the very front / back by handing it fresh z-index
  // keys just above the current max (front) or below the current min (back).
  const reorderSelection = (toFront: boolean) => {
    const ids = manipulableIds(selectionRef.current);
    if (ids.length === 0) {
      return;
    }
    const all = sortedElements(sceneRef.current);
    if (all.length === 0) {
      return;
    }
    const minZ = all[0]!.z;
    const maxZ = all[all.length - 1]!.z;
    const keys = toFront
      ? generateNKeysBetween(maxZ, null, ids.length)
      : generateNKeysBetween(null, minZ, ids.length);
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    ids.forEach((id, i) => {
      const el = next[id];
      if (el) {
        next[id] = { ...el, z: keys[i]! };
      }
    });
    commit(before, next, ids);
  };

  // Stamp a fresh groupId on the selection (>= 2 elements) so they move and
  // select together; ungroup clears it.
  const groupSelection = () => {
    const ids = manipulableIds(selectionRef.current);
    if (ids.length < 2) {
      return;
    }
    const gid = createElementId();
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    for (const id of ids) {
      const el = next[id];
      if (el) {
        next[id] = { ...el, groupId: gid };
      }
    }
    commit(before, next, ids);
  };

  const ungroupSelection = () => {
    const ids = selectionRef.current;
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    const changed: string[] = [];
    for (const id of ids) {
      const el = next[id];
      if (el?.groupId) {
        const { groupId: _groupId, ...rest } = el;
        void _groupId;
        next[id] = rest;
        changed.push(id);
      }
    }
    if (changed.length > 0) {
      setActiveGroup(null);
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
      const el = newElement({
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
        const conn = newElement({
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
  /**
   * Rubs out every ink stroke under the pointer.
   *
   * Whole strokes, not pieces of them: that is what a whiteboard eraser does,
   * and splitting a stroke in two would leave the board holding fragments
   * nobody can select back into one.
   */
  const eraseAt = (p: Point) => {
    const it = interactionRef.current;
    if (!it || it.mode !== 'erase') {
      return;
    }
    const tolerance = 10 / viewportRef.current.zoom;
    const hits: string[] = [];
    for (const el of Object.values(sceneRef.current)) {
      if (el.type !== 'freehand' || isLockedForMe(el.id) || el.locked) {
        continue;
      }
      const pts = (el.points ?? []).map(([x, y]) => ({
        x: x ?? 0,
        y: y ?? 0,
      }));
      // Half the stroke's own width on top of the pointer tolerance, so a
      // thick highlighter is as easy to catch as it looks.
      const reach = tolerance + (el.style.strokeWidth ?? 3) / 2;
      if (polylineHitTest(pts, p, reach)) {
        hits.push(el.id);
      }
    }
    if (hits.length === 0) {
      return;
    }
    const next = { ...sceneRef.current };
    for (const id of hits) {
      delete next[id];
    }
    it.removed.push(...hits);
    applyLocal(next);
  };

  const styleForType = (type: BoardTool): Partial<BoardElementStyle> => {
    if (type === 'sticky') {
      return {
        fill: style.stickyColor,
        color: style.textColor,
        opacity: style.opacity,
      };
    }
    if (type === 'text') {
      // Was `style.stroke`: a text element has no outline, so the stroke
      // swatch was standing in for a text colour. Now it uses the real one.
      return { color: style.textColor, opacity: style.opacity };
    }
    if (type === 'highlighter') {
      // Wide and translucent, so it reads as marker over the top of things
      // rather than as another pen line. Still a plain freehand element, so
      // it moves, exports and erases like any other ink.
      return {
        stroke: style.stroke,
        strokeWidth: Math.max(14, (style.strokeWidth ?? 3) * 5),
        opacity: 0.35,
      };
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
      color: style.textColor,
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

    if (e.button === 2) {
      rightDragRef.current = { x: e.clientX, y: e.clientY };
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
    const lockToggleEl = target.closest('[data-lock-toggle]');

    // A locked element is not selectable; clicking its lock badge is the only
    // way to unlock it (any editor may).
    if (lockToggleEl) {
      if (canEdit) {
        const id = lockToggleEl.getAttribute('data-lock-toggle')!;
        const el = sceneRef.current[id];
        if (el?.locked) {
          const before = cloneScene(sceneRef.current);
          const { locked: _locked, lockedBy: _lockedBy, ...rest } = el;
          void _locked;
          void _lockedBy;
          commit(before, { ...sceneRef.current, [id]: rest }, [id]);
        }
      }
      return;
    }

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

    // connector END handle: drag either end onto another shape to re-attach.
    const endHandleEl = target.closest('[data-connector-end]');
    if (endHandleEl && selectionRef.current.length === 1) {
      const id = selectionRef.current[0]!;
      const el = sceneRef.current[id];
      if (el && el.type === 'connector' && !isLockedForMe(id)) {
        interactionRef.current = {
          mode: 'connector-endpoint',
          id,
          end: endHandleEl.getAttribute('data-connector-end') as 'from' | 'to',
          before: cloneScene(sceneRef.current),
        };
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
      const connector = newElement({
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

    if (t === 'eraser') {
      const before = cloneScene(sceneRef.current);
      interactionRef.current = { mode: 'erase', before, removed: [] };
      eraseAt(p);
      return;
    }

    if (t === 'pen' || t === 'highlighter') {
      const z = topZ(sceneRef.current);
      const pen = newElement({
        type: 'freehand',
        x: p.x,
        y: p.y,
        z,
        style: styleForType(t),
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
      const el = newElement({
        type: t,
        x: maybeSnap(p.x),
        y: maybeSnap(p.y),
        w: 1,
        h: 1,
        z,
        style: styleForType(t),
      });
      if (t !== 'frame' && shapeNameRef.current) {
        el.shape = shapeNameRef.current;
      }
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

    // The format painter consumes the click: with a style on the brush, a
    // click paints rather than selects.
    if (elEl && styleBrushRef.current && canEdit) {
      const id = elEl.getAttribute('data-el-id')!;
      if (applyStyleBrush(id)) {
        // Stays loaded, so a run of elements can be painted one after the
        // other. Escape or the toolbar button puts it down.
        return;
      }
    }

    // Drag a whole SEGMENT of the already-selected connector. The bend
    // handles above move a corner and skew both segments meeting there; Miro
    // slides the segment along its normal instead, which is what keeps an
    // elbow route orthogonal. Only offered where there are real segments to
    // move — a plain straight line keeps its midpoint handle.
    if (elEl && canEdit) {
      const cid = elEl.getAttribute('data-el-id')!;
      const cel = sceneRef.current[cid];
      if (
        cel &&
        cel.type === 'connector' &&
        !cel.locked &&
        !isLockedForMe(cid) &&
        selectionRef.current.length === 1 &&
        selectionRef.current[0] === cid
      ) {
        const routing = cel.connector?.routing ?? 'straight';
        const bends = connectorBendPoints(
          cel.connector?.bends,
          cel.connector?.bend
        );
        if (routing === 'elbow' || bends.length > 0) {
          const { start, end } = resolveConnectorEndpoints(
            cel,
            sceneRef.current
          );
          const exitSide = cel.connector?.fromAnchor
            ? anchorSide(cel.connector.fromAnchor)
            : undefined;
          const pts = connectorWaypoints(routing, start, end, bends, exitSide);
          interactionRef.current = {
            mode: 'connector-segment',
            id: cid,
            index: nearestSegmentIndex(pts, p),
            start: p,
            pts,
            before: cloneScene(sceneRef.current),
          };
          return;
        }
      }
    }

    // select tool
    if (elEl) {
      let id = elEl.getAttribute('data-el-id')!;
      // Alt+click digs beneath the top-most element to the one under it.
      if (e.altKey) {
        const stack = sortedElements(sceneRef.current)
          .filter((el) =>
            pointInRotatedRect(p, elementRect(el), el.rotation ?? 0)
          )
          .map((el) => el.id)
          .reverse();
        if (stack.length > 1) {
          const curr =
            selectionRef.current.length === 1 ? selectionRef.current[0]! : id;
          const idx = stack.indexOf(curr);
          id = stack[(idx + 1) % stack.length] ?? id;
        }
      }
      if (sceneRef.current[id]?.locked) {
        return;
      }
      const additive = e.shiftKey;
      const clicked = sceneRef.current[id];
      const inActiveGroup =
        !!clicked?.groupId && clicked.groupId === activeGroupRef.current;
      // A grouped element selects its whole group, unless you have entered that
      // group (double-click) or hold Alt to pick the single element.
      const targetIds =
        !e.altKey && clicked?.groupId && !inActiveGroup
          ? Object.values(sceneRef.current)
              .filter((el) => el.groupId === clicked.groupId)
              .map((el) => el.id)
          : [id];
      if (!clicked?.groupId || clicked.groupId !== activeGroupRef.current) {
        setActiveGroup(null);
      }
      let nextSel: string[];
      if (additive) {
        const already = targetIds.every((g) =>
          selectionRef.current.includes(g)
        );
        nextSel = already
          ? selectionRef.current.filter((s) => !targetIds.includes(s))
          : [...new Set([...selectionRef.current, ...targetIds])];
      } else {
        nextSel = targetIds.every((g) => selectionRef.current.includes(g))
          ? selectionRef.current
          : targetIds;
      }
      setSelection(nextSel);
      const origin: Record<string, Point> = {};
      // moving a frame drags its contents along with it; elements hard-locked
      // by another user are excluded so they stay put.
      for (const sid of withFrameChildren(nextSel)) {
        if (isLockedForMe(sid) || sceneRef.current[sid]?.locked) {
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
    setActiveGroup(null);
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
    const el = newElement({
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
    pointerSceneRef.current = clientToScene(e.clientX, e.clientY);

    // Past a few pixels the gesture is a pan, not a click, so the menu that
    // would otherwise open on release is cancelled. The threshold matters:
    // a mouse always moves a pixel or two between press and release.
    const rightStart = rightDragRef.current;
    if (rightStart) {
      const travelled = Math.hypot(
        e.clientX - rightStart.x,
        e.clientY - rightStart.y
      );
      if (travelled > 4) {
        suppressContextMenuRef.current = true;
      }
    }
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
        // One mind-map node dragged over another re-parents it on release.
        const dragged = Object.keys(it.origin);
        if (
          dragged.length === 1 &&
          sceneRef.current[dragged[0]!]?.type === 'mindmap'
        ) {
          const over = mindmapAt(p, new Set(dragged));
          setMindmapDrop(
            over && canReparentMindmap(sceneRef.current, dragged[0]!, over.id)
              ? over.id
              : null
          );
        }
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
              // Keep the exact drop position on the target border instead of
              // rounding to one of four sides, which made the arrow jump to
              // the middle of the edge on release.
              toAnchor: target
                ? fractionalAnchor(elementRect(target), p)
                : undefined,
            },
          },
        };
        applyLocal(next);
        break;
      }
      case 'connector-endpoint': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const target = elementAt(p, { shapesOnly: true });
        // Re-attaching keeps the exact drop position on the border, the same
        // as drawing a new connector does.
        const anchor = target
          ? fractionalAnchor(elementRect(target), p)
          : undefined;
        const points = (el.points ?? [[0, 0], [0, 0]]).map((pt) => [...pt]);
        if (it.end === 'from') {
          points[0] = [p.x, p.y];
        } else {
          points[points.length - 1] = [p.x, p.y];
        }
        const next = {
          ...sceneRef.current,
          [it.id]: {
            ...el,
            points,
            connector: {
              ...el.connector,
              ...(it.end === 'from'
                ? { fromId: target?.id, fromAnchor: anchor }
                : { toId: target?.id, toAnchor: anchor }),
            },
          },
        };
        applyLocal(next);
        schedulePersist([it.id]);
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
      case 'connector-segment': {
        const el = sceneRef.current[it.id];
        if (!el) {
          break;
        }
        const nextBends = moveConnectorSegment(it.pts, it.index, {
          x: p.x - it.start.x,
          y: p.y - it.start.y,
        });
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
      case 'erase':
        eraseAt(p);
        break;
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
        .filter((el) => rectsIntersect(box, elementRect(el)) && !el.locked)
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
        const def = newElement({ type: el.type, x: el.x, y: el.y, z: el.z });
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

    if (it.mode === 'erase') {
      if (it.removed.length > 0) {
        // Persist through `commit` so the whole gesture is one undo step and
        // the removals reach everyone else.
        persistIds(it.removed, sceneRef.current);
        commit(it.before, sceneRef.current, it.removed);
      }
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

    // A mind-map node released over another one joins it. The relayout puts
    // the node where the tree wants it, which overrides wherever the drag
    // happened to leave it — so this commits from the relaid scene, not the
    // dragged one.
    const dropTarget = mindmapDropTargetRef.current;
    setMindmapDrop(null);
    if (it.mode === 'move' && dropTarget && ids.length === 1) {
      const edit = reparentMindmap(sceneRef.current, ids[0]!, dropTarget);
      if (edit.changedIds.length > 0) {
        applyLocal(edit.scene);
        commit(it.before, edit.scene, [
          ...new Set([...ids, ...edit.changedIds]),
        ]);
        return;
      }
    }

    commit(it.before, sceneRef.current, ids);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      rightDragRef.current = null;
    }
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
      // Presentation owns the arrow keys and Escape while it is running, so
      // it is handled before anything else can claim them.
      if (slideRef.current !== null) {
        if (e.key === 'Escape' && styleBrushRef.current) {
        e.preventDefault();
        styleBrushRef.current = null;
        setStyleBrush(null);
        return;
      }
      if (e.key === 'Escape') {
          e.preventDefault();
          stopPresenting();
          return;
        }
        if (
          e.key === 'ArrowRight' ||
          e.key === 'ArrowDown' ||
          e.key === 'PageDown' ||
          e.code === 'Space'
        ) {
          e.preventDefault();
          goToSlide(slideRef.current + 1);
          return;
        }
        if (
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowUp' ||
          e.key === 'PageUp'
        ) {
          e.preventDefault();
          goToSlide(slideRef.current - 1);
          return;
        }
      }

      // "?" and the view keys work read-only: nothing they do changes the
      // board, and a viewer needs them most.
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }
      if (meta && (e.key === '0' || e.key === '1')) {
        e.preventDefault();
        if (e.key === '1') {
          fitToContent();
        } else {
          cancelFollow();
          setViewport({ ...viewportRef.current, zoom: 1 });
        }
        return;
      }
      if (meta && (e.key === '+' || e.key === '=' || e.key === '-')) {
        e.preventDefault();
        zoomBy(e.key === '-' ? 1 / 1.2 : 1.2);
        return;
      }
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
      if (meta && e.key.toLowerCase() === 'c') {
        if (copySelection()) {
          e.preventDefault();
        }
        return;
      }
      if (meta && e.key.toLowerCase() === 'x') {
        if (copySelection()) {
          e.preventDefault();
          deleteSelection();
        }
        return;
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
      if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          ungroupSelection();
        } else {
          groupSelection();
        }
        return;
      }
      if (meta && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleLockSelection();
        return;
      }
      if (meta && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        reorderSelection(e.key === ']');
        return;
      }
      // 1-8 apply your own saved colours: plain for the fill, Shift for the
      // stroke. Bare digits are free — the view shortcuts all take Ctrl.
      if (!meta && /^[1-8]$/.test(e.key)) {
        const palette = readCustomColors();
        const color = palette[Number(e.key) - 1];
        if (color) {
          e.preventDefault();
          onStyleChange(e.shiftKey ? { stroke: color } : { fill: color });
        }
        return;
      }
      const map: Record<string, BoardTool> = {
        v: 'select',
        h: 'hand',
        s: 'sticky',
        // Miro's key for a sticky note; both are bound so muscle memory from
        // either tool works.
        n: 'sticky',
        r: 'rect',
        o: 'ellipse',
        d: 'diamond',
        t: 'text',
        c: 'connector',
        l: 'connector',
        p: 'pen',
        k: 'highlighter',
        e: 'eraser',
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
      const clone = newElement({
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
    const newEl = newElement({
      type,
      x: maybeSnap(x),
      y: maybeSnap(y),
      z: topZ(sceneRef.current),
      style: styleForType(type as BoardTool),
      text: '',
    });
    const withNew = { ...sceneRef.current, [newEl.id]: newEl };
    const conn = newElement({
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
  /**
   * Drop a set of elements into the board with fresh ids, top-of-stack z keys
   * and every internal reference rewritten to the new ids.
   *
   * That rewrite is the whole point: without it a pasted copy still points at
   * the ORIGINAL elements, so the copied arrows snap back to the shapes they
   * were copied from.
   *
   * `at` is where the group's centre lands; omitted, it lands in the middle of
   * the viewport.
   */
  const insertElements = (elems: BoardElement[], at?: Point) => {
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
    const center = at ?? {
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

  const insertTemplate = (templateId: string) => {
    const tpl = getTemplate(templateId);
    if (!tpl) {
      return;
    }
    insertElements(Object.values(tpl.build()));
  };

  // ----- clipboard ---------------------------------------------------------
  // Board-local, not the system clipboard: elements carry structure (links to
  // other elements, styles, mind-map parents) that no text/image flavour can
  // hold. The OS paste handler further down still takes care of images.
  const clipboardRef = useRef<BoardElement[]>([]);

  const copySelection = (): boolean => {
    const ids = selectionRef.current;
    if (ids.length === 0) {
      return false;
    }
    const picked = ids
      .map((id) => sceneRef.current[id])
      .filter((el): el is BoardElement => !!el)
      .map((el) => cloneElement(el));
    if (picked.length === 0) {
      return false;
    }
    clipboardRef.current = picked;
    return true;
  };

  const pasteClipboard = () => {
    const items = clipboardRef.current;
    if (items.length === 0) {
      return;
    }
    // Paste under the pointer when it is over the board, which is where the
    // eye already is; otherwise fall back to the middle of the viewport.
    insertElements(
      items.map((el) => cloneElement(el)),
      pointerSceneRef.current ?? undefined
    );
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
      if (patch.textColor !== undefined) {
        nextStyle.color = patch.textColor;
      }
      if (patch.fontFamily !== undefined) {
        nextStyle.fontFamily = patch.fontFamily;
      }
      if (patch.textAlign !== undefined) {
        nextStyle.textAlign = patch.textAlign;
      }
      if (patch.verticalAlign !== undefined) {
        nextStyle.verticalAlign = patch.verticalAlign;
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
  // Arrowheads of the first selected connector, so the toolbar can show which
  // ends are currently on.
  const connectorArrows = (() => {
    const id = manipulableIds(selectionRef.current).find(
      (i) => sceneRef.current[i]?.type === 'connector'
    );
    const c = id ? sceneRef.current[id]?.connector : undefined;
    return { start: c?.arrowStart ?? false, end: c?.arrowEnd ?? true };
  })();

  const onConnectorArrows = (arrows: { start: boolean; end: boolean }) => {
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
      next[id] = {
        ...el,
        connector: {
          ...el.connector,
          arrowStart: arrows.start,
          arrowEnd: arrows.end,
        },
      };
    }
    commit(before, next, ids);
  };

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  const toggleElementFlag = (id: string, flag: 'hidden' | 'locked') => {
    const el = sceneRef.current[id];
    if (!el || isLockedForMe(id)) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = {
      ...sceneRef.current,
      [id]: { ...el, [flag]: el[flag] ? undefined : true },
    };
    commit(before, next, [id]);
  };

  /** Move one element one place through the stack. */
  const moveInStack = (id: string, direction: 'up' | 'down') => {
    const el = sceneRef.current[id];
    if (!el || isLockedForMe(id)) {
      return;
    }
    const z = zKeyForStep(sceneRef.current, id, direction);
    if (!z) {
      // Already at that end of the stack.
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current, [id]: { ...el, z } };
    commit(before, next, [id]);
  };

  // Format painter: the style lifted off one element, waiting to be dropped
  // on others. Kept in a ref as well because the pointer handler that applies
  // it runs from a stale closure.
  const [styleBrush, setStyleBrush] = useState<BoardElementStyle | null>(null);
  const styleBrushRef = useRef<BoardElementStyle | null>(null);

  const pickUpStyle = () => {
    const id = selectionRef.current[0];
    const el = id ? sceneRef.current[id] : undefined;
    if (!el) {
      // Nothing selected: a second press puts the brush down again.
      styleBrushRef.current = null;
      setStyleBrush(null);
      return;
    }
    // The whole look, not just the fill: copying a style by hand meant
    // re-picking nine separate things.
    const picked: BoardElementStyle = { ...el.style };
    styleBrushRef.current = picked;
    setStyleBrush(picked);
  };

  const applyStyleBrush = (id: string) => {
    const brush = styleBrushRef.current;
    const el = sceneRef.current[id];
    if (!brush || !el || isLockedForMe(id) || el.locked) {
      return false;
    }
    const before = cloneScene(sceneRef.current);
    // A sticky keeps its own fill: a note painted with a shape's white would
    // stop looking like a note at all.
    const next = {
      ...sceneRef.current,
      [id]: {
        ...el,
        style: {
          ...brush,
          ...(el.type === 'sticky' ? { fill: el.style.fill } : {}),
        },
      },
    };
    commit(before, next, [id]);
    return true;
  };

  // Private mode. Kept in a ref too: the pointer handlers that build elements
  // run from a stale closure and would otherwise never see it turned on.
  const [privateMode, setPrivateMode] = useState(false);
  const privateModeRef = useRef(false);

  /**
   * Every element this canvas creates goes through here, so private mode is
   * applied in ONE place rather than threaded through a dozen creation sites
   * (shapes, stickies, ink, connectors, frames, paste, import, templates).
   */
  const newElement = (input: Parameters<typeof createElement>[0]) => {
    const el = createElement(input);
    if (privateModeRef.current) {
      el.privateBy = workspace.userId;
    }
    return el;
  };

  const togglePrivateMode = () => {
    const next = !privateModeRef.current;
    privateModeRef.current = next;
    setPrivateMode(next);
  };

  /** Clears the private stamp on everything of yours, all at once. */
  const revealPrivate = () => {
    const ids = Object.values(sceneRef.current)
      .filter((el) => el.privateBy === workspace.userId)
      .map((el) => el.id);
    if (ids.length === 0) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current };
    for (const id of ids) {
      const el = next[id];
      if (el) {
        next[id] = { ...el, privateBy: undefined };
      }
    }
    commit(before, next, ids);
  };

  // Presentation: which frame is on screen, or null when not presenting.
  const [slide, setSlide] = useState<number | null>(null);
  const slideRef = useRef<number | null>(null);
  const presenting = slide !== null;
  const [miroImportOpen, setMiroImportOpen] = useState(false);

  // Right-click on empty canvas. Holds the SCENE point as well as the screen
  // one, so "paste here" and "add here" land where the click was, not in the
  // middle of the view.
  const [canvasMenu, setCanvasMenu] = useState<{
    x: number;
    y: number;
    scene: Point;
  } | null>(null);

  // Outline for the NEXT shape drawn. Kept in a ref as well, because the
  // pointer handler that creates the element runs from a stale closure.
  const [shapeName, setShapeName] = useState<string | null>(null);
  const shapeNameRef = useRef<string | null>(null);

  // Last pointer position in scene coordinates, so a keyboard paste can land
  // where the user is looking rather than always in the middle.
  const pointerSceneRef = useRef<Point | null>(null);

  // Node a dragged mind-map node would be re-parented onto. Kept in a ref as
  // well as state: the drag reads it on drop, the render only needs it to
  // draw the halo.
  const [mindmapDropTarget, setMindmapDropTarget] = useState<string | null>(
    null
  );
  const mindmapDropTargetRef = useRef<string | null>(null);
  const setMindmapDrop = (id: string | null) => {
    if (mindmapDropTargetRef.current === id) {
      return;
    }
    mindmapDropTargetRef.current = id;
    setMindmapDropTarget(id);
  };

  /** Top-most mind-map node under `p`, ignoring the ones being dragged. */
  const mindmapAt = (p: Point, exclude: Set<string>): BoardElement | null => {
    const list = sortedElements(sceneRef.current);
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i]!;
      if (el.type !== 'mindmap' || exclude.has(el.id)) {
        continue;
      }
      if (pointInRotatedRect(p, elementRect(el), el.rotation ?? 0)) {
        return el;
      }
    }
    return null;
  };

  const privateElementIds = Object.values(scene)
    .filter((el) => el.privateBy === workspace.userId)
    .map((el) => el.id);

  const selectionIsShapes =
    selectionRef.current.length > 0 &&
    selectionRef.current.every((id) => {
      const type = sceneRef.current[id]?.type;
      return type === 'rect' || type === 'ellipse' || type === 'diamond';
    });

  // Direction of the selected mind map, or null when the selection is not one.
  const mindmapDirection = (() => {
    const id = selectionRef.current.find(
      (i) => sceneRef.current[i]?.type === 'mindmap'
    );
    return id ? mindmapDirectionOf(sceneRef.current, id) : null;
  })();

  const onShapePick = (shape: string | null) => {
    setShapeName(shape);
    shapeNameRef.current = shape;
    // Applies to the selection when there is one; otherwise it just arms the
    // next shape drawn, the same way a fill colour does.
    const ids = manipulableIds(selectionRef.current).filter((id) => {
      const type = sceneRef.current[id]?.type;
      return type === 'rect' || type === 'ellipse' || type === 'diamond';
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
      next[id] = { ...el, shape: shape ?? undefined };
    }
    commit(before, next, ids);
  };

  const onEmoji = (character: string) => {
    if (!character) {
      return;
    }
    const cw = svgRef.current?.clientWidth ?? 800;
    const ch = svgRef.current?.clientHeight ?? 600;
    const vp = viewportRef.current;
    const size = 72;
    const el = newElement({
      type: 'text',
      x: (cw / 2 - vp.x) / vp.zoom - size / 2,
      y: (ch / 2 - vp.y) / vp.zoom - size / 2,
      w: size,
      h: size,
      z: topZ(sceneRef.current),
      style: { fontSize: size, color: '#111827' },
      text: character,
    });
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current, [el.id]: el };
    applyLocal(next);
    setSelection([el.id]);
    commit(before, next, [el.id]);
  };

  const onFramePreset = (preset: { w: number; h: number; label: string }) => {
    const cw = svgRef.current?.clientWidth ?? 800;
    const ch = svgRef.current?.clientHeight ?? 600;
    const vp = viewportRef.current;
    const center = {
      x: (cw / 2 - vp.x) / vp.zoom,
      y: (ch / 2 - vp.y) / vp.zoom,
    };
    const el = newElement({
      type: 'frame',
      x: maybeSnap(center.x - preset.w / 2),
      y: maybeSnap(center.y - preset.h / 2),
      w: preset.w,
      h: preset.h,
      z: topZ(sceneRef.current),
      style: styleForType('frame'),
      // The label names the ratio, which is what the frame is FOR; a frame
      // called "Frame" tells the next reader nothing.
      text: preset.label,
    });
    const before = cloneScene(sceneRef.current);
    const next = { ...sceneRef.current, [el.id]: el };
    applyLocal(next);
    setSelection([el.id]);
    commit(before, next, [el.id]);
    setTool('select');
  };

  const onMindmapDirection = (direction: 'right' | 'left' | 'down' | 'up') => {
    const id = manipulableIds(selectionRef.current).find(
      (i) => sceneRef.current[i]?.type === 'mindmap'
    );
    if (!id) {
      return;
    }
    const before = cloneScene(sceneRef.current);
    const edit = setMindmapDirection(sceneRef.current, id, direction);
    if (edit.changedIds.length === 0) {
      return;
    }
    commit(before, edit.scene, edit.changedIds);
  };

  // Line jumps of the first selected connector, so the toggle shows its state.
  const connectorJumps = (() => {
    const id = manipulableIds(selectionRef.current).find(
      (i) => sceneRef.current[i]?.type === 'connector'
    );
    return sceneRef.current[id ?? '']?.connector?.jumps ?? false;
  })();

  // Head shapes of the first selected connector, read through the same
  // fallback the renderer uses so the toolbar shows what is actually drawn.
  const connectorHeads = (() => {
    const id = manipulableIds(selectionRef.current).find(
      (i) => sceneRef.current[i]?.type === 'connector'
    );
    const c = id ? sceneRef.current[id]?.connector : undefined;
    return {
      start: c?.arrowStartType ?? (c?.arrowStart ? 'triangle' : 'none'),
      end: c?.arrowEndType ?? (c?.arrowEnd === false ? 'none' : 'triangle'),
    };
  })();

  const onConnectorHeads = (heads: { start: string; end: string }) => {
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
      next[id] = {
        ...el,
        connector: {
          ...el.connector,
          arrowStartType: heads.start as 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond',
          arrowEndType: heads.end as 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond',
          // Keep the booleans in step so an older client still draws
          // something sensible.
          arrowStart: heads.start !== 'none',
          arrowEnd: heads.end !== 'none',
        },
      };
    }
    commit(before, next, ids);
  };

  const connectorKind = (() => {
    const id = manipulableIds(selectionRef.current).find(
      (i) => sceneRef.current[i]?.type === 'connector'
    );
    return sceneRef.current[id ?? '']?.connector?.kind ?? null;
  })();

  const onConnectorKind = (kind: string | null) => {
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
      next[id] = {
        ...el,
        connector: {
          ...el.connector,
          kind: (kind ?? undefined) as
            | 'blocks'
            | 'dependsOn'
            | 'relatesTo'
            | undefined,
        },
      };
    }
    commit(before, next, ids);
  };

  // The badge of the first selected element, and the setter for all of them.
  const badgeValue = (() => {
    const id = manipulableIds(selectionRef.current)[0];
    return (id ? sceneRef.current[id]?.badge : '') ?? '';
  })();

  const onBadgeChange = (value: string) => {
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
      // Emptied means removed, not stored as an empty chip.
      next[id] = { ...el, badge: value.trim() ? value : undefined };
    }
    commit(before, next, ids);
  };

  const onConnectorJumps = (jumps: boolean) => {
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
      next[id] = { ...el, connector: { ...el.connector, jumps } };
    }
    commit(before, next, ids);
  };

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
      const el = newElement({
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
        // Nothing to attach: fall through to the board's own clipboard, so
        // Ctrl+V pastes copied elements.
        if (clipboardRef.current.length > 0) {
          e.preventDefault();
          pasteClipboard();
        }
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
    // Double-clicking a grouped element enters its group so single clicks then
    // target individual members and this element can be edited directly.
    if (el.groupId && activeGroupRef.current !== el.groupId) {
      setActiveGroup(el.groupId);
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
  // Collapsed mind-map descendants, plus anything hidden from the layers
  // panel: both are "in the scene but not drawn".
  const hiddenIds = useMemo(() => {
    const ids = mindmapHiddenIds(scene);
    for (const el of Object.values(scene)) {
      if (el.hidden) {
        ids.add(el.id);
      }
    }
    return ids;
  }, [scene]);
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
  // Screen size of one grid cell. Doubled until it is comfortably readable:
  // at 15% zoom the raw 20-unit step is a 3px cell, and dots that close
  // together are a grey haze rather than a grid. Powers of two keep every dot
  // on the board's own grid.
  const gridCell = (() => {
    let cell = gridSize * viewport.zoom;
    while (cell > 0 && cell < 18) {
      cell *= 2;
    }
    return cell;
  })();
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
      // The board surface is white in both themes: everything drawn on it —
      // fills, strokes, text — is authored in light colours, so a dark canvas
      // made an ordinary board look broken and did not match the export.
      className="relative h-full w-full overflow-hidden bg-white"
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
              '[data-quick],[data-handle],[data-mindadd],[data-collapse],[data-lock-toggle]'
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
        onContextMenu={(e) => {
          e.preventDefault();
          // A right-drag that panned the board must not finish with a menu.
          if (suppressContextMenuRef.current) {
            suppressContextMenuRef.current = false;
            return;
          }
          // Only for the bare canvas: a right-click on an element is already
          // handled by that element's own menu.
          const target = e.target as Element;
          if (target.closest('[data-el-id]')) {
            return;
          }
          if (!canEdit) {
            return;
          }
          setCanvasMenu({
            x: e.clientX,
            y: e.clientY,
            scene: clientToScene(e.clientX, e.clientY),
          });
        }}
      >
        <defs>
          {/* Screen space, NOT board space. The cell is the grid step times
              the zoom and the pattern is shifted by the pan, so the dots stay
              the same size on screen however far you zoom while still landing
              on the board's own grid. Inside the scaled group a dot was 0.18px
              at 15% zoom — invisible — and a blob at 400%. */}
          <pattern
            id={`board-grid-${node.id}`}
            width={gridCell}
            height={gridCell}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.x % gridCell} ${
              viewport.y % gridCell
            })`}
          >
            {/* Explicit, NOT currentColor: this circle lives in <defs>, so it
                inherits from there and not from the rect that references the
                pattern. A colour set on that rect never reached it. */}
            <circle cx={1} cy={1} r={1.4} fill={GRID_DOT} />
          </pattern>
        </defs>

        {/* Outside the scene group on purpose — see the pattern above. */}
        <rect
          className="board-no-export"
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill={`url(#board-grid-${node.id})`}
        />

        <g
          ref={sceneGroupRef}
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
        >
          {/* mind-map parent -> child edges (behind the nodes) */}
          <g style={{ pointerEvents: 'none' }}>
            {mindEdges.map((edge) => (
              // The link leaves whichever side actually faces the child, so a
              // map growing down or left keeps its edges outside the boxes
              // instead of doubling back across them.
              <path
                key={edge.id}
                d={mindmapEdgePath(edge.from, edge.to)}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={2}
              />
            ))}
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
                if (!canEdit && !canComment) {
                  return;
                }
                if (!selectionRef.current.includes(el.id)) {
                  setSelection([el.id]);
                }
                setContextMenu({ x: e.clientX, y: e.clientY });
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

          {/* lock badges — click to unlock; excluded from image export */}
          {ordered
            .filter((el) => el.locked)
            .map((el) => {
              const bx = el.x + el.w - 10;
              const by = el.y + 10;
              return (
                <g
                  key={`lock-${el.id}`}
                  className="board-no-export"
                  data-lock-toggle={el.id}
                  style={{ cursor: 'pointer' }}
                >
                  <title>Locked — click to unlock</title>
                  <circle
                    cx={bx}
                    cy={by}
                    r={9}
                    fill="#ffffff"
                    stroke="#f59e0b"
                    strokeWidth={1.4}
                  />
                  <g
                    transform={`translate(${bx - 5} ${by - 5}) scale(0.42)`}
                    fill="none"
                    stroke="#b45309"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </g>
                </g>
              );
            })}

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

          {/* Your own private elements, ringed so it is obvious which ones
              nobody else can see yet. */}
          {privateElementIds.map((id) => {
            const el = scene[id];
            if (!el) {
              return null;
            }
            const tl = sceneToClient({ x: el.x, y: el.y });
            return (
              <rect
                key={`private-${id}`}
                x={tl.x - 3}
                y={tl.y - 3}
                width={el.w * viewport.zoom + 6}
                height={el.h * viewport.zoom + 6}
                rx={6}
                fill="none"
                stroke="#a855f7"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            );
          })}

          {/* the mind-map node a drag would attach to */}
          {mindmapDropTarget &&
            (() => {
              const el = scene[mindmapDropTarget];
              if (!el) {
                return null;
              }
              const tl = sceneToClient({ x: el.x, y: el.y });
              return (
                <rect
                  x={tl.x - 4}
                  y={tl.y - 4}
                  width={el.w * viewport.zoom + 8}
                  height={el.h * viewport.zoom + 8}
                  rx={8}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              );
            })()}

          {/* The two ENDS of the selected connector. Without these an arrow
              attached to the wrong shape had to be deleted and drawn again. */}
          {singleConnector &&
            (() => {
              const { start, end } = resolveConnectorEndpoints(
                singleConnector,
                scene
              );
              return (['from', 'to'] as const).map((which) => {
                const sp = sceneToClient(which === 'from' ? start : end);
                return (
                  <circle
                    key={which}
                    data-connector-end={which}
                    cx={sp.x}
                    cy={sp.y}
                    r={6}
                    fill="#fff"
                    stroke="#22c55e"
                    strokeWidth={2}
                    style={{ cursor: 'crosshair' }}
                  />
                );
              });
            })()}

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

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onPointerDown={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="absolute min-w-44 rounded-md border border-border bg-popover p-1 text-sm text-foreground shadow-md"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.min(contextMenu.y, window.innerHeight - 300),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {canEdit && (
              <>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    reorderSelection(true);
                    setContextMenu(null);
                  }}
                >
                  <ArrowUpToLine className="size-4" /> Bring to front
                </button>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    reorderSelection(false);
                    setContextMenu(null);
                  }}
                >
                  <ArrowDownToLine className="size-4" /> Send to back
                </button>
                {selection.length >= 2 && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                    onClick={() => {
                      groupSelection();
                      setContextMenu(null);
                    }}
                  >
                    <Group className="size-4" /> Group
                  </button>
                )}
                {selection.some((sid) => scene[sid]?.groupId) && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                    onClick={() => {
                      ungroupSelection();
                      setContextMenu(null);
                    }}
                  >
                    <Ungroup className="size-4" /> Ungroup
                  </button>
                )}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    toggleLockSelection();
                    setContextMenu(null);
                  }}
                >
                  {selectionLocked ? (
                    <LockOpen className="size-4" />
                  ) : (
                    <Lock className="size-4" />
                  )}{' '}
                  {selectionLocked ? 'Unlock' : 'Lock'}
                </button>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    duplicateSelection();
                    setContextMenu(null);
                  }}
                >
                  <Copy className="size-4" /> Duplicate
                </button>
                <div className="my-1 h-px bg-border" />
              </>
            )}
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                void onExport();
                setContextMenu(null);
              }}
            >
              <ImageDown className="size-4" /> Export as image
            </button>
            {canComment && selection.length === 1 && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  const id = selectionRef.current[0];
                  if (id) {
                    setCommentElementId(id);
                  }
                  setContextMenu(null);
                }}
              >
                <MessageSquare className="size-4" /> Add comment
              </button>
            )}
            {canEdit && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent',
                    'text-red-600'
                  )}
                  onClick={() => {
                    deleteSelection();
                    setContextMenu(null);
                  }}
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* The toolbar is the one thing an audience must not see. */}
      {!presenting && <BoardToolbar
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
        connectorArrows={connectorArrows}
        onConnectorArrows={onConnectorArrows}
        connectorJumps={connectorJumps}
        onConnectorJumps={onConnectorJumps}
        connectorHeads={connectorHeads}
        onConnectorHeads={onConnectorHeads}
        connectorKind={connectorKind}
        onConnectorKind={onConnectorKind}
        badgeValue={badgeValue}
        onBadgeChange={onBadgeChange}
        mindmapDirection={mindmapDirection}
        onMindmapDirection={onMindmapDirection}
        onFramePreset={onFramePreset}
        onMiroImport={() => setMiroImportOpen(true)}
        onPresent={startPresenting}
        onEmoji={onEmoji}
        styleBrushActive={styleBrush !== null}
        onStyleBrush={pickUpStyle}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((open) => !open)}
        privateMode={privateMode}
        onPrivateMode={togglePrivateMode}
        privateCount={privateElementIds.length}
        onRevealPrivate={revealPrivate}
        shapeName={shapeName}
        onShapePick={onShapePick}
        selectionIsShapes={selectionIsShapes}
        onComment={() => {
          const id = selection[0];
          if (id) {
            setCommentElementId(id);
          }
        }}
        commentEnabled={canComment && selection.length === 1}
      />}

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

      {presenting &&
        (() => {
          const frames = frameOrder(scene);
          const current = frames[slide];
          return (
            <div className="pointer-events-auto absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-xl backdrop-blur">
              <button
                type="button"
                aria-label="Previous frame"
                disabled={slide === 0}
                onClick={() => goToSlide(slide - 1)}
                className="rounded-md px-2 py-1 text-sm hover:bg-accent disabled:opacity-40"
              >
                &lsaquo;
              </button>
              <span className="min-w-24 text-center text-sm">
                <span className="font-medium">{slide + 1}</span>
                <span className="text-muted-foreground"> / {frames.length}</span>
                {current?.text && (
                  <span className="ml-2 text-muted-foreground">
                    {current.text}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label="Next frame"
                disabled={slide >= frames.length - 1}
                onClick={() => goToSlide(slide + 1)}
                className="rounded-md px-2 py-1 text-sm hover:bg-accent disabled:opacity-40"
              >
                &rsaquo;
              </button>
              <div className="h-5 w-px bg-border" />
              <button
                type="button"
                onClick={stopPresenting}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Exit (Esc)
              </button>
            </div>
          );
        })()}

      {canvasMenu && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[60] cursor-default"
            onClick={() => setCanvasMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCanvasMenu(null);
            }}
          />
          <div
            className="fixed z-[61] w-56 rounded-lg border border-border bg-background p-1 shadow-xl"
            style={{ left: canvasMenu.x, top: canvasMenu.y }}
          >
            {[
              {
                label: 'Sticky note',
                run: () => placeClickElement('sticky', canvasMenu.scene),
              },
              {
                label: 'Text',
                run: () => placeClickElement('text', canvasMenu.scene),
              },
              {
                label: 'Mind map',
                run: () => placeClickElement('mindmap', canvasMenu.scene),
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setCanvasMenu(null);
                  item.run();
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {item.label}
              </button>
            ))}

            <div className="my-1 h-px bg-border" />

            <button
              type="button"
              disabled={clipboardRef.current.length === 0}
              onClick={() => {
                setCanvasMenu(null);
                pointerSceneRef.current = canvasMenu.scene;
                pasteClipboard();
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40"
            >
              Paste here
            </button>
            <button
              type="button"
              onClick={() => {
                setCanvasMenu(null);
                setSelection(Object.keys(sceneRef.current));
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              Select everything
            </button>

            <div className="my-1 h-px bg-border" />

            <button
              type="button"
              onClick={() => {
                setCanvasMenu(null);
                fitToContent();
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              Fit everything on screen
            </button>
            <button
              type="button"
              onClick={() => {
                setCanvasMenu(null);
                startPresenting();
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              Present the frames
            </button>
            <button
              type="button"
              onClick={() => {
                setCanvasMenu(null);
                setShortcutsOpen(true);
              }}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              Keyboard shortcuts
              <span className="text-xs text-muted-foreground">?</span>
            </button>
          </div>
        </>
      )}

      {layersOpen && (
        <BoardLayers
          scene={scene}
          selection={selection}
          canEdit={canEdit}
          onSelect={(id, additive) =>
            setSelection(
              additive
                ? selection.includes(id)
                  ? selection.filter((s) => s !== id)
                  : [...selection, id]
                : [id]
            )
          }
          onToggleHidden={(id) => toggleElementFlag(id, 'hidden')}
          onToggleLocked={(id) => toggleElementFlag(id, 'locked')}
          onMove={moveInStack}
          onClose={() => setLayersOpen(false)}
        />
      )}

      <BoardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      <BoardMiroImportDialog
        open={miroImportOpen}
        onOpenChange={setMiroImportOpen}
        // The converted elements already carry fresh ids and correct internal
        // links, so they go in through the same path as a template: dropped at
        // the viewport centre, selected, one undo step.
        onImport={(elements) => insertElements(elements)}
      />
    </div>
  );

  // Zoom about the middle of the viewport, which is where the eye is when the
  // gesture comes from the keyboard rather than the wheel.
  function zoomBy(factor: number) {
    cancelFollow();
    const cw = svgRef.current?.clientWidth ?? 800;
    const ch = svgRef.current?.clientHeight ?? 600;
    const vp = viewportRef.current;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * factor));
    const sx = (cw / 2 - vp.x) / vp.zoom;
    const sy = (ch / 2 - vp.y) / vp.zoom;
    setViewport({ x: cw / 2 - sx * zoom, y: ch / 2 - sy * zoom, zoom });
  }

  // Fit one rectangle to the viewport, with a margin so a frame's own border
  // does not sit against the edge of the screen.
  function fitToRect(b: Rect, margin = 80) {
    cancelFollow();
    const cw = svgRef.current?.clientWidth ?? 800;
    const ch = svgRef.current?.clientHeight ?? 600;
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(cw / (b.w + margin), ch / (b.h + margin))
      )
    );
    setViewport({
      x: cw / 2 - (b.x + b.w / 2) * zoom,
      y: ch / 2 - (b.y + b.h / 2) * zoom,
      zoom,
    });
  }

  function goToSlide(index: number) {
    const frames = frameOrder(sceneRef.current);
    if (frames.length === 0) {
      return;
    }
    // Clamped, not wrapped: running off the end of a deck should stop at the
    // last slide, not silently start over.
    const i = Math.max(0, Math.min(frames.length - 1, index));
    const frame = frames[i]!;
    slideRef.current = i;
    setSlide(i);
    setSelection([]);
    fitToRect(elementRect(frame));
  }

  function startPresenting() {
    const frames = frameOrder(sceneRef.current);
    if (frames.length === 0) {
      toast.info('Add a frame first — frames are the slides.');
      return;
    }
    setTool('select');
    goToSlide(0);
  }

  function stopPresenting() {
    slideRef.current = null;
    setSlide(null);
  }

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

// A copy that shares nothing with the original: the clipboard outlives the
// scene it was taken from, so a shallow copy would let a later edit of the
// source mutate what is about to be pasted.
const cloneElement = (el: BoardElement): BoardElement => ({
  ...el,
  style: { ...el.style },
  points: el.points?.map((pt) => [...pt]),
  connector: el.connector
    ? {
        ...el.connector,
        bends: el.connector.bends?.map((b) => ({ ...b })),
      }
    : undefined,
  mindmap: el.mindmap ? { ...el.mindmap } : undefined,
});

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
          connectorBendPoints(c.bends, c.bend),
          // Same exit side as the drawn path, otherwise the invisible hit
          // stroke runs somewhere else than the visible line and grabbing a
          // segment picks the wrong one.
          c.fromAnchor ? anchorSide(c.fromAnchor) : undefined
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
