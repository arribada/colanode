import { Maximize, Minus, Plus } from 'lucide-react';
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import {
  BoardElement,
  BoardElementStyle,
  BoardScene,
  hasNodeRole,
  NodeRole,
} from '@colanode/core';
import { BoardElementView } from '@colanode/ui/components/whiteboards/board/board-element';
import { BoardToolbar } from '@colanode/ui/components/whiteboards/board/board-toolbar';
import {
  BoardStyleState,
  BoardTool,
  DEFAULT_BOARD_STYLE,
} from '@colanode/ui/components/whiteboards/board/board-types';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  createElement,
  elementRect,
  frameChildIds,
  resolveConnectorEndpoints,
  sortedElements,
  topZ,
} from '@colanode/ui/lib/board/elements';
import {
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
import { downloadBlob, exportScenePng } from '@colanode/ui/lib/board/png';
import { cn } from '@colanode/ui/lib/utils';

const GRID = 20;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;

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
  | { mode: 'pen'; id: string; before: BoardScene };

interface WhiteboardCanvasProps {
  whiteboard: LocalWhiteboardNode;
  role: NodeRole;
}

const cloneScene = (scene: BoardScene): BoardScene =>
  JSON.parse(JSON.stringify(scene)) as BoardScene;

export const WhiteboardCanvas = ({
  whiteboard,
  role,
}: WhiteboardCanvasProps) => {
  const workspace = useWorkspace();
  const canEdit = hasNodeRole(role, 'editor');

  const [scene, setScene] = useState<BoardScene>(
    () => (whiteboard.scene as BoardScene | undefined) ?? {}
  );
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<BoardTool>('select');
  const [selection, setSelection] = useState<string[]>([]);
  const [style, setStyle] = useState<BoardStyleState>(DEFAULT_BOARD_STYLE);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(
    null
  );
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [history, setHistory] = useState<{
    past: BoardScene[];
    future: BoardScene[];
  }>({ past: [], future: [] });

  const svgRef = useRef<SVGSVGElement>(null);
  const sceneGroupRef = useRef<SVGGElement>(null);
  const sceneRef = useRef(scene);
  const viewportRef = useRef(viewport);
  const toolRef = useRef(tool);
  const selectionRef = useRef(selection);
  const interactionRef = useRef<Interaction | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ dist: number; viewport: Viewport } | null>(null);
  const spaceRef = useRef(false);
  const persistPendingRef = useRef<Set<string> | null>(null);
  const rafRef = useRef<number | null>(null);

  sceneRef.current = scene;
  viewportRef.current = viewport;
  toolRef.current = tool;
  selectionRef.current = selection;

  // Adopt remote / persisted scene changes when the user is idle so that
  // collaborators' element edits appear without clobbering an active gesture.
  useEffect(() => {
    if (interactionRef.current || editing) {
      return;
    }
    const incoming = (whiteboard.scene as BoardScene | undefined) ?? {};
    if (JSON.stringify(incoming) !== JSON.stringify(sceneRef.current)) {
      setScene(incoming);
    }
  }, [whiteboard.scene]);

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

  // ----- persistence (element-level, collision-safe) -----------------------
  const persistIds = useCallback(
    (ids: string[], source: BoardScene) => {
      if (!canEdit || ids.length === 0) {
        return;
      }
      const nodes = workspace.collections.nodes;
      if (!nodes.has(whiteboard.id)) {
        return;
      }
      nodes.update(whiteboard.id, (draft) => {
        if (draft.type !== 'whiteboard') {
          return;
        }
        const current = (draft.scene as BoardScene | undefined) ?? {};
        const next: BoardScene = { ...current };
        for (const id of ids) {
          const el = source[id];
          if (el === undefined) {
            delete next[id];
          } else {
            next[id] = el;
          }
        }
        draft.scene = next;
      });
    },
    [canEdit, workspace, whiteboard.id]
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

  // ----- element helpers ---------------------------------------------------
  const styleForType = (type: BoardTool): Partial<BoardElementStyle> => {
    if (type === 'sticky') {
      return { fill: style.stickyColor, color: '#1f2937' };
    }
    if (type === 'text') {
      return { color: style.stroke };
    }
    if (type === 'connector' || type === 'pen') {
      return {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeStyle: style.strokeStyle,
      };
    }
    return {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeStyle: style.strokeStyle,
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
    interactionRef.current = {
      mode: 'pan',
      startClient: { x: e.clientX, y: e.clientY },
      startViewport: { ...viewportRef.current },
    };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    svgRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        viewport: { ...viewportRef.current },
      };
      interactionRef.current = null;
      return;
    }

    const panIntent =
      spaceRef.current || e.button === 1 || toolRef.current === 'hand';
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
      // moving a frame drags its contents along with it
      for (const sid of withFrameChildren(nextSel)) {
        const el = sceneRef.current[sid];
        if (el) {
          origin[sid] = { x: el.x, y: el.y };
        }
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
        const next = { ...sceneRef.current };
        for (const [id, o] of Object.entries(it.origin)) {
          const el = next[id];
          if (!el) {
            continue;
          }
          next[id] = {
            ...el,
            x: maybeSnap(o.x + rawDx),
            y: maybeSnap(o.y + rawDy),
          };
        }
        applyLocal(next);
        schedulePersist(Object.keys(it.origin));
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
        const target = elementAt(p);
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
      e.preventDefault();
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
  }, []);

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
    const ids = selectionRef.current;
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
    const ids = withFrameChildren(selectionRef.current);
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

  const onStyleChange = (patch: Partial<BoardStyleState>) => {
    setStyle((s) => ({ ...s, ...patch }));
    const ids = selectionRef.current;
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
      next[id] = { ...el, style: nextStyle };
    }
    commit(before, next, ids);
  };

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
    if (!canEdit) {
      return;
    }
    const el = sceneRef.current[id];
    if (!el || el.type === 'connector' || el.type === 'freehand') {
      return;
    }
    setSelection([id]);
    setEditing({ id, value: el.text ?? '' });
  };

  // ----- export ------------------------------------------------------------
  const onExport = async () => {
    const group = sceneGroupRef.current;
    if (!group) {
      return;
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
    const region: Rect = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      w: bounds.w + pad * 2,
      h: bounds.h + pad * 2,
    };
    try {
      const blob = await exportScenePng(group, region, { scale: 2 });
      downloadBlob(blob, `${whiteboard.name || 'board'}.png`);
    } catch {
      // ignore export failures (e.g. tainted canvas)
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

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/30">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const elEl = (e.target as Element).closest('[data-el-id]');
          if (elEl) {
            onElementDoubleClick(elEl.getAttribute('data-el-id')!);
          } else if (canEdit && tool === 'select') {
            const p = clientToScene(e.clientX, e.clientY);
            placeClickElement('text', p);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern
            id={`board-grid-${whiteboard.id}`}
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
            fill={`url(#board-grid-${whiteboard.id})`}
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
            >
              <BoardElementView
                element={el}
                scene={scene}
                editing={editing?.id === el.id}
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
                  el.type !== 'freehand' && (
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
        </g>
      </svg>

      <BoardToolbar
        tool={tool}
        onToolChange={setTool}
        style={style}
        onStyleChange={onStyleChange}
        hasSelection={selection.length > 0}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        readOnly={!canEdit}
        onUndo={undo}
        onRedo={redo}
        onDelete={deleteSelection}
        onDuplicate={duplicateSelection}
        onExport={onExport}
      />

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

      {/* bottom-right controls */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
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
          onClick={() =>
            setViewport((v) => ({
              ...v,
              zoom: Math.max(MIN_ZOOM, v.zoom / 1.2),
            }))
          }
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className="min-w-12 rounded-md px-1 text-xs hover:bg-accent"
          title="Reset zoom"
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
          title="Zoom in"
          onClick={() =>
            setViewport((v) => ({
              ...v,
              zoom: Math.min(MAX_ZOOM, v.zoom * 1.2),
            }))
          }
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
      </div>
    </div>
  );

  function fitToContent() {
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
  if (element.type === 'connector') {
    const { start, end } = resolveConnectorEndpoints(element, scene);
    return (
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
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
