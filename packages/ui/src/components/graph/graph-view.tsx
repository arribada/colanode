// ABOUTME: Knowledge-graph canvas — a force layout that settles on screen, with
// ABOUTME: pan, zoom, draggable nodes and neighbourhood highlighting.
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Maximize2, Minus, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  GraphEdgeMode,
  NodeGraph,
  ProjectGraph,
} from '@colanode/client/lib';
import { PROJECT_LANES, type ProjectLane } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import {
  carryPositions,
  DEFAULT_LAYOUT_OPTIONS,
  fitView,
  layoutBounds,
  seedPositions,
  stepLayout,
  zoomAt,
  type LayoutOptions,
  type LayoutPoint,
  type ViewTransform,
} from '@colanode/ui/lib/graph/layout';
import { cn } from '@colanode/ui/lib/utils';

// Literal classes only: Tailwind never generates a class it cannot see written
// out, so a computed `fill-${colour}-500` would paint nothing.
const TYPE_FILL: Record<string, string> = {
  space: 'fill-rose-500',
  page: 'fill-sky-500',
  record: 'fill-emerald-500',
  database: 'fill-violet-500',
  folder: 'fill-slate-400',
  whiteboard: 'fill-amber-500',
};

const TYPE_DOT: Record<string, string> = {
  space: 'bg-rose-500',
  page: 'bg-sky-500',
  record: 'bg-emerald-500',
  database: 'bg-violet-500',
  folder: 'bg-slate-400',
  whiteboard: 'bg-amber-500',
};

// Project graph: one colour per lane, and the lanes left to right.
const LANE_FILL: Record<ProjectLane, string> = {
  context: 'fill-slate-400',
  requirements: 'fill-sky-500',
  design: 'fill-violet-500',
  decisions: 'fill-amber-500',
  verification: 'fill-emerald-500',
  delivery: 'fill-rose-500',
};

const LANE_DOT: Record<ProjectLane, string> = {
  context: 'bg-slate-400',
  requirements: 'bg-sky-500',
  design: 'bg-violet-500',
  decisions: 'bg-amber-500',
  verification: 'bg-emerald-500',
  delivery: 'bg-rose-500',
};

const LANE_LABEL: Record<ProjectLane, string> = {
  context: 'Context',
  requirements: 'Requirements',
  design: 'Design',
  decisions: 'Decisions',
  verification: 'Verification',
  delivery: 'Delivery',
};

// Scene units between two lane columns.
const LANE_GAP = 260;

const laneX = (lane: ProjectLane): number =>
  (PROJECT_LANES.indexOf(lane) - (PROJECT_LANES.length - 1) / 2) * LANE_GAP;

const EDGE_MODES: { value: GraphEdgeMode; label: string; hint: string }[] = [
  { value: 'both', label: 'Both', hint: 'Mentions and nesting together' },
  { value: 'links', label: 'Links', hint: 'Only pages that mention each other' },
  { value: 'hierarchy', label: 'Nesting', hint: 'Only the parent/child tree' },
];

// Depth 4 reaches 255 pages from a typical page and 5 reaches 363 — at that
// point a local graph is just the whole wiki in a pane, which is what made
// higher depths feel broken. Three is where it stops being local.
const MAX_DEPTH = 3;

// Stop the simulation once it stops moving; restart it when something changes.
// Without this the canvas would keep burning a frame budget for ever.
const SETTLE_THRESHOLD = 0.6;
const MAX_FRAMES = 900;

// The layout compares every pair of nodes on every frame, so the cost grows
// with the square of the count: the whole wiki (2,000 nodes) locked the tab.
// Past this many, only the best connected are drawn and the view says so.
const MAX_NODES = 300;

// Scene units kept around the outermost nodes when the view frames them, so
// their circles and labels are not cut by the pane edge.
const NODE_MARGIN = 24;

// Share of the remaining distance the camera covers each frame while it
// follows a layout that is still unfolding: smooth, and there in ~20 frames.
const FOLLOW_EASE = 0.2;

const radiusFor = (degree: number): number =>
  4 + Math.min(9, Math.sqrt(degree) * 2.4);

const spreadFor = (count: number): number => Math.max(26, 70 - count / 10);

// A bigger graph needs more room, or every node piles into the middle and the
// result is the hairball the user saw at depth 3.
const optionsForSize = (count: number): LayoutOptions => ({
  ...DEFAULT_LAYOUT_OPTIONS,
  linkDistance: Math.min(150, 70 + count * 0.18),
  repulsion: Math.min(16000, 4200 + count * 28),
  centerStrength: count > 120 ? 0.02 : 0.012,
});

const indexById = (points: LayoutPoint[]): Map<string, LayoutPoint> => {
  const index = new Map<string, LayoutPoint>();
  for (const point of points) {
    index.set(point.id, point);
  }
  return index;
};

const transformOf = (view: ViewTransform): string =>
  `translate(${view.x} ${view.y}) scale(${view.zoom})`;

interface GraphViewProps {
  // Local graph when set; whole workspace when absent.
  focusNodeId?: string;
  // The focus page belongs to a project that follows the template, so the
  // project graph (lanes, coverage) can be shown. It opens on it.
  projectScope?: boolean;
  className?: string;
}

export const GraphView = ({
  focusNodeId,
  projectScope = false,
  className,
}: GraphViewProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [projectMode, setProjectMode] = useState(projectScope);
  const inProject = projectScope && projectMode && Boolean(focusNodeId);

  const [edgeMode, setEdgeMode] = useState<GraphEdgeMode>('both');
  const [includeOrphans, setIncludeOrphans] = useState(false);
  // A page's own graph opens on what sits directly around it. Two hops already
  // pulls in the neighbours' neighbours, which is most of a space.
  const [depth, setDepth] = useState(focusNodeId ? 1 : 2);
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 800, height: 600 });

  // On a page's own graph the orphans are its sub-pages that nothing links to,
  // and once nesting is drawn there are none: the switch only means something
  // on Links there.
  const orphansApply = !focusNodeId || edgeMode === 'links';
  const showOrphans = includeOrphans && orphansApply;
  const optionsKey = inProject
    ? `${focusNodeId ?? ''}|project`
    : `${focusNodeId ?? ''}|${edgeMode}|${showOrphans}|${depth}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement | null>());
  const edgeRefs = useRef<Array<SVGLineElement | null>>([]);
  const pointsRef = useRef<LayoutPoint[]>([]);
  const pointIndex = useRef(new Map<string, LayoutPoint>());
  const draggingRef = useRef<{ id: string | null; panFrom: { x: number; y: number } | null }>({
    id: null,
    panFrom: null,
  });
  const graphRef = useRef<NodeGraph | undefined>(undefined);
  const sizeRef = useRef(size);
  // What is on screen. While the camera follows an unfolding layout it moves
  // without React, so the handlers read this rather than `view`.
  const viewRef = useRef(view);
  const followRef = useRef(false);
  const runningRef = useRef<number | null>(null);
  const laidOutKeyRef = useRef<string | null>(null);

  const graphQuery = useLiveQuery(
    {
      type: 'node.graph.get',
      userId: workspace.userId,
      edgeMode,
      includeOrphans: showOrphans,
      focusNodeId: focusNodeId ?? null,
      depth,
      maxNodes: MAX_NODES,
      scope: inProject ? 'project' : 'local',
    },
    // Each option is its own query, so without this every click on a filter
    // or the depth swapped the whole view, toolbar included, for a loading
    // line until the new graph came back.
    { placeholderData: keepPreviousData }
  );

  const graph = graphQuery.data;
  // Only a project graph carries lanes; a local graph left on screen while the
  // project one loads must not be drawn in columns.
  const projectGraph =
    inProject && graph && 'lanes' in graph ? (graph as ProjectGraph) : null;
  const lanes = projectGraph?.lanes ?? null;
  const lanesRef = useRef<Record<string, ProjectLane> | null>(null);
  const headerRefs = useRef(new Map<ProjectLane, SVGTextElement | null>());

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        sizeRef.current = { width: rect.width, height: rect.height };
        setSize(sizeRef.current);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const commitView = useCallback((next: ViewTransform) => {
    viewRef.current = next;
    setView(next);
  }, []);

  // Hands the camera back to the user: what is on screen becomes the state.
  const stopFollowing = useCallback(() => {
    if (followRef.current) {
      followRef.current = false;
      setView(viewRef.current);
    }
  }, []);

  // Client coordinates to viewport units, origin at the centre like the viewBox.
  const toViewport = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    // The viewBox follows the container, so this is 1 once the observer has
    // reported; dividing by it keeps a dragged node under the cursor anyway.
    const scale = Math.min(
      rect.width / sizeRef.current.width,
      rect.height / sizeRef.current.height
    );
    return {
      x: (clientX - rect.left - rect.width / 2) / scale,
      y: (clientY - rect.top - rect.height / 2) / scale,
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    // React listens to wheel events passively, so preventDefault in an onWheel
    // prop is ignored with a console warning and whatever is behind scrolls
    // along with the zoom. A listener of our own can claim the event.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      stopFollowing();
      const point = toViewport(event.clientX, event.clientY);
      commitView(
        zoomAt(
          viewRef.current,
          event.deltaY < 0 ? 1.12 : 0.89,
          point.x,
          point.y
        )
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [commitView, stopFollowing, toViewport]);

  // The simulation drives the DOM directly. Re-rendering ~280 groups and ~900
  // lines through React on every frame would make the animation the slowest
  // part of the app; writing transforms on the nodes we already rendered costs
  // nothing and is what makes it feel alive rather than appear fully formed.
  const paint = useCallback(() => {
    if (lanesRef.current) {
      // Lane titles sit above the highest node, wherever the layout put it.
      const top = layoutBounds(pointsRef.current).minY - 40;
      for (const [, element] of headerRefs.current) {
        element?.setAttribute('y', String(top));
      }
    }
    for (const point of pointsRef.current) {
      const element = nodeRefs.current.get(point.id);
      if (element) {
        element.setAttribute('transform', `translate(${point.x} ${point.y})`);
      }
    }
    const edges = graphRef.current?.edges ?? [];
    for (let i = 0; i < edges.length; i++) {
      const line = edgeRefs.current[i];
      const edge = edges[i];
      if (!line || !edge) {
        continue;
      }
      const a = pointIndex.current.get(edge.from);
      const b = pointIndex.current.get(edge.to);
      if (!a || !b) {
        continue;
      }
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
    }
  }, []);

  // Moves the camera one step toward framing the whole layout, straight on the
  // DOM like the nodes. Returns whether it still has a visible way to go.
  const followStep = useCallback((): boolean => {
    const bounds = layoutBounds(pointsRef.current);
    const target = fitView(
      {
        minX: bounds.minX - NODE_MARGIN,
        minY: bounds.minY - NODE_MARGIN,
        maxX: bounds.maxX + NODE_MARGIN,
        maxY: bounds.maxY + NODE_MARGIN,
      },
      sizeRef.current.width,
      sizeRef.current.height
    );
    const current = viewRef.current;
    const next = {
      x: current.x + (target.x - current.x) * FOLLOW_EASE,
      y: current.y + (target.y - current.y) * FOLLOW_EASE,
      zoom: current.zoom + (target.zoom - current.zoom) * FOLLOW_EASE,
    };
    viewRef.current = next;
    sceneRef.current?.setAttribute('transform', transformOf(next));
    return (
      Math.abs(target.x - next.x) + Math.abs(target.y - next.y) > 0.5 ||
      Math.abs(target.zoom - next.zoom) > 0.001
    );
  }, []);

  const stopSimulation = useCallback(() => {
    if (runningRef.current !== null) {
      cancelAnimationFrame(runningRef.current);
      runningRef.current = null;
    }
  }, []);

  const startSimulation = useCallback(() => {
    const current = graphRef.current;
    if (!current || current.nodes.length === 0) {
      return;
    }
    stopSimulation();
    const laneMap = lanesRef.current;
    const options: LayoutOptions = laneMap
      ? {
          ...optionsForSize(current.nodes.length),
          laneTargets: new Map(
            current.nodes.map((n) => [n.id, laneX(laneMap[n.id] ?? 'design')])
          ),
        }
      : optionsForSize(current.nodes.length);
    let frames = 0;
    const loop = () => {
      const moved = stepLayout(pointsRef.current, current.edges, options);
      paint();
      const cameraMoving = followRef.current && followStep();
      frames++;
      if (
        draggingRef.current.id ||
        ((moved > SETTLE_THRESHOLD || cameraMoving) && frames < MAX_FRAMES)
      ) {
        runningRef.current = requestAnimationFrame(loop);
      } else {
        runningRef.current = null;
        stopFollowing();
      }
    };
    runningRef.current = requestAnimationFrame(loop);
  }, [paint, followStep, stopFollowing, stopSimulation]);

  // A layout effect, so a new graph is placed before the browser paints and
  // its nodes never flash at the origin for a frame.
  useLayoutEffect(() => {
    graphRef.current = graph;
    lanesRef.current = lanes;
    if (!graph || graph.nodes.length === 0) {
      pointsRef.current = [];
      pointIndex.current = new Map();
      return;
    }
    if (lanes && laidOutKeyRef.current !== optionsKey) {
      // Entering the project graph: start every node in its column, in a
      // stack, so the lanes read from the first frame.
      const rows = new Map<ProjectLane, number>();
      pointsRef.current = graph.nodes.map((n) => {
        const lane = lanes[n.id] ?? 'design';
        const row = rows.get(lane) ?? 0;
        rows.set(lane, row + 1);
        return { id: n.id, x: laneX(lane), y: row * 36, vx: 0, vy: 0 };
      });
    } else {
      // Carried over, not re-seeded: re-seeding every node on every new graph
      // is what made each filter or depth change throw the whole picture away.
      pointsRef.current = carryPositions(
        pointsRef.current,
        graph.nodes.map((n) => n.id),
        graph.edges,
        spreadFor(graph.nodes.length)
      );
    }
    pointIndex.current = indexById(pointsRef.current);
    paint();
    // A graph the user asked for (first open, another mode, depth or filter)
    // is framed as it unfolds. One that changed because somebody edited the
    // wiki is not: the camera stays where the user left it. `optionsKey` comes
    // from the render in which this graph first showed, so it names the
    // options the graph was computed for.
    if (laidOutKeyRef.current !== optionsKey) {
      laidOutKeyRef.current = optionsKey;
      followRef.current = true;
    }
    startSimulation();
    return stopSimulation;
  }, [graph, lanes, paint, startSimulation, stopSimulation]);

  const resetLayout = () => {
    const current = graphRef.current;
    if (!current || current.nodes.length === 0) {
      return;
    }
    pointsRef.current = seedPositions(
      current.nodes.map((n) => n.id),
      spreadFor(current.nodes.length)
    );
    pointIndex.current = indexById(pointsRef.current);
    paint();
    followRef.current = true;
    startSimulation();
  };

  const nodeIds = useMemo(
    () => new Set(graph?.nodes.map((n) => n.id) ?? []),
    [graph]
  );

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of graph?.edges ?? []) {
      if (!map.has(edge.from)) map.set(edge.from, new Set());
      if (!map.has(edge.to)) map.set(edge.to, new Set());
      map.get(edge.from)!.add(edge.to);
      map.get(edge.to)!.add(edge.from);
    }
    return map;
  }, [graph]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !graph) {
      return null;
    }
    return new Set(
      graph.nodes.filter((n) => n.name.toLowerCase().includes(term)).map((n) => n.id)
    );
  }, [search, graph]);

  // A node removed from under the cursor never fires mouseleave, and a stale
  // hover dims the whole new graph.
  const activeHover = hovered !== null && nodeIds.has(hovered) ? hovered : null;

  const isDimmed = (id: string): boolean => {
    if (matches) {
      return !matches.has(id);
    }
    if (!activeHover) {
      return false;
    }
    return id !== activeHover && !neighbours.get(activeHover)?.has(id);
  };

  const toScene = (clientX: number, clientY: number) => {
    const point = toViewport(clientX, clientY);
    const current = viewRef.current;
    return {
      x: (point.x - current.x) / current.zoom,
      y: (point.y - current.y) / current.zoom,
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    stopFollowing();
    const point = toViewport(event.clientX, event.clientY);
    draggingRef.current.panFrom = {
      x: point.x - viewRef.current.x,
      y: point.y - viewRef.current.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const dragId = draggingRef.current.id;
    if (dragId) {
      const point = pointIndex.current.get(dragId);
      if (point) {
        const scene = toScene(event.clientX, event.clientY);
        point.x = scene.x;
        point.y = scene.y;
        point.vx = 0;
        point.vy = 0;
      }
      return;
    }
    const from = draggingRef.current.panFrom;
    if (from) {
      const point = toViewport(event.clientX, event.clientY);
      commitView({
        ...viewRef.current,
        x: point.x - from.x,
        y: point.y - from.y,
      });
    }
  };

  const onPointerUp = () => {
    draggingRef.current.id = null;
    draggingRef.current.panFrom = null;
  };

  const labelOpacity = view.zoom < 0.45 ? 0 : Math.min(1, (view.zoom - 0.45) * 3);

  const linkCount = graph
    ? graph.edges.filter((e) => e.kind === 'link').length
    : 0;
  const relationCount = graph
    ? graph.edges.filter((e) => e.kind === 'relation').length
    : 0;
  const coverage = projectGraph?.project?.coverage ?? null;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        {projectScope && focusNodeId && (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={inProject ? 'secondary' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setProjectMode((v) => !v)}
              >
                Project
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {inProject
                ? 'Back to the links around this page'
                : 'The whole project in lanes: requirements, design, decisions, tests'}
            </TooltipContent>
          </Tooltip>
        )}
        {!inProject && (
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {EDGE_MODES.map((mode) => (
            <Tooltip delayDuration={300} key={mode.value}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={edgeMode === mode.value ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setEdgeMode(mode.value)}
                >
                  {mode.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{mode.hint}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        )}
        {!inProject && (
        <Tooltip delayDuration={300}>
          {/* A disabled button takes no pointer events, so its own tooltip,
              the one that says why, would never open: the span carries it. */}
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                size="sm"
                variant={showOrphans ? 'secondary' : 'ghost'}
                className="h-7 px-2 text-xs"
                disabled={!orphansApply}
                onClick={() => setIncludeOrphans((v) => !v)}
              >
                Orphans
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {!orphansApply
              ? 'With nesting drawn every sub-page is already connected'
              : focusNodeId
                ? 'Also show the sub-pages of this page that nothing links to'
                : 'Also show pages that are neither linked nor nested'}
          </TooltipContent>
        </Tooltip>
        )}
        {focusNodeId && !inProject && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Depth</span>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0"
                    aria-label="Show fewer hops"
                    disabled={depth <= 1}
                    onClick={() => setDepth((d) => Math.max(1, d - 1))}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Fewer hops from this page</TooltipContent>
            </Tooltip>
            <span className="w-3 text-center tabular-nums text-foreground">
              {depth}
            </span>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0"
                    aria-label="Show more hops"
                    disabled={depth >= MAX_DEPTH}
                    onClick={() => setDepth((d) => Math.min(MAX_DEPTH, d + 1))}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {depth >= MAX_DEPTH
                  ? 'Beyond three hops a local graph is the whole wiki'
                  : 'More hops from this page'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Highlight…"
          className="h-7 w-40 text-xs"
        />
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={resetLayout}
            >
              <Maximize2 className="size-3.5" />
              Reset
            </Button>
          </TooltipTrigger>
          <TooltipContent>Lay the graph out afresh and frame it</TooltipContent>
        </Tooltip>
        {graph && (
          <span
            className={cn(
              'ml-auto text-xs text-muted-foreground transition-opacity',
              graphQuery.isPlaceholderData && 'opacity-50'
            )}
          >
            {graph.truncated && (
              <span
                data-testid="graph-truncated"
                className="mr-2 text-amber-600 dark:text-amber-500"
              >
                too many to draw: showing the {graph.truncated.shown} best
                connected of {graph.truncated.total}
              </span>
            )}
            {coverage && projectGraph?.project && (
              <span
                data-testid="graph-coverage"
                className="mr-3 text-foreground"
              >
                <span className="font-medium">{projectGraph.project.code}</span>
                {' · '}
                {coverage.requirements} requirements · {coverage.tested} tested
                · {coverage.passed} passed
                {coverage.failing > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {' '}
                    · {coverage.failing} failing
                  </span>
                )}
                {coverage.requirements - coverage.tested > 0 && (
                  <span className="text-amber-600 dark:text-amber-500">
                    {' '}
                    · {coverage.requirements - coverage.tested} untested
                  </span>
                )}
                {' · '}
                {coverage.openDecisions}/{coverage.decisions} decisions open
              </span>
            )}
            {graph.nodes.length} nodes · {linkCount} links ·{' '}
            {relationCount > 0 && <>{relationCount} relations · </>}
            {graph.edges.length - linkCount - relationCount} nested
            {graph.unresolved.length > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-500">
                {graph.unresolved.length} unresolved
              </span>
            )}
          </span>
        )}
      </div>

      {/* Always mounted: the size observer and the wheel listener attach to
          this element once, so it must not come and go with the data. */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg
          className="size-full select-none"
          role="img"
          aria-label="Knowledge graph"
          viewBox={`${-size.width / 2} ${-size.height / 2} ${size.width} ${size.height}`}
        >
          <g ref={sceneRef} transform={transformOf(view)}>
            {graph?.edges.map((edge, i) => {
              const dim = isDimmed(edge.from) && isDimmed(edge.to);
              return (
                <line
                  key={`${edge.kind}:${edge.from}>${edge.to}`}
                  ref={(el) => {
                    edgeRefs.current[i] = el;
                  }}
                  className={cn(
                    'transition-opacity',
                    edge.kind === 'relation'
                      ? 'stroke-emerald-600 opacity-70 dark:stroke-emerald-400'
                      : 'stroke-muted-foreground',
                    edge.kind === 'hierarchy' && 'opacity-25',
                    edge.kind === 'link' && 'opacity-50',
                    dim && 'opacity-5'
                  )}
                  strokeWidth={
                    edge.kind === 'relation'
                      ? 1.5
                      : edge.kind === 'link'
                        ? 1.2
                        : 0.8
                  }
                  strokeDasharray={edge.kind === 'hierarchy' ? '3 3' : undefined}
                >
                  {edge.label && <title>{edge.label}</title>}
                </line>
              );
            })}

            {lanes &&
              PROJECT_LANES.map((lane) => (
                <text
                  key={lane}
                  ref={(el) => {
                    headerRefs.current.set(lane, el);
                  }}
                  x={laneX(lane)}
                  y={0}
                  textAnchor="middle"
                  className="pointer-events-none fill-muted-foreground text-[11px] font-medium uppercase tracking-wide"
                >
                  {LANE_LABEL[lane]}
                </text>
              ))}
            {graph?.nodes.map((node) => {
              const dim = isDimmed(node.id);
              const r = radiusFor(node.degree);
              const isFocus = node.id === focusNodeId;
              return (
                <g
                  key={node.id}
                  ref={(el) => {
                    nodeRefs.current.set(node.id, el);
                  }}
                  className={cn(
                    'cursor-pointer transition-opacity',
                    dim && 'opacity-20'
                  )}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    stopFollowing();
                    draggingRef.current.id = node.id;
                    startSimulation();
                  }}
                  onClick={(event) => {
                    // A drag that ended on the node must not also navigate.
                    if (event.detail === 0) {
                      return;
                    }
                    navigate({
                      to: '/workspace/$userId/$nodeId',
                      params: { userId: workspace.userId, nodeId: node.id },
                    });
                  }}
                >
                  <title>{node.name}</title>
                  <circle
                    r={r}
                    className={cn(
                      lanes
                        ? LANE_FILL[lanes[node.id] ?? 'design']
                        : (TYPE_FILL[node.type] ?? 'fill-slate-400'),
                      isFocus && 'stroke-foreground'
                    )}
                    strokeWidth={isFocus ? 2 : 0}
                  />
                  <text
                    y={r + 11}
                    textAnchor="middle"
                    opacity={labelOpacity}
                    className="pointer-events-none fill-foreground text-[9px]"
                  >
                    {node.name.length > 26
                      ? `${node.name.slice(0, 25)}…`
                      : node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {!graph && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Building the graph…
          </div>
        )}

        {graph && graph.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing to draw here yet.
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {inProject
                ? 'This page is not in a project that follows the project template, or the project has no pages yet.'
                : 'Mention another page with @ and it appears in this graph. Switch to Nesting to see how this corner of the wiki is arranged instead.'}
            </p>
          </div>
        )}

        {graph && graph.nodes.length > 0 && (
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 rounded-md border bg-background/85 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
            {lanes
              ? PROJECT_LANES.map((lane) => (
                  <span key={lane} className="flex items-center gap-1">
                    <span className={cn('size-2 rounded-full', LANE_DOT[lane])} />
                    {LANE_LABEL[lane]}
                  </span>
                ))
              : Object.entries(TYPE_DOT).map(([type, dot]) => (
                  <span key={type} className="flex items-center gap-1">
                    <span className={cn('size-2 rounded-full', dot)} />
                    {type}
                  </span>
                ))}
            {lanes && (
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-3 bg-emerald-600 dark:bg-emerald-400" />
                relation
              </span>
            )}
            <span className="ml-1 border-l pl-2">drag a node to move it</span>
          </div>
        )}
      </div>
    </div>
  );
};
