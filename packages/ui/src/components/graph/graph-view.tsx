// ABOUTME: Knowledge-graph canvas — a force layout that settles on screen, with
// ABOUTME: pan, zoom, draggable nodes and neighbourhood highlighting.
import { useNavigate } from '@tanstack/react-router';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GraphEdgeMode } from '@colanode/client/lib';
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
  DEFAULT_LAYOUT_OPTIONS,
  seedPositions,
  stepLayout,
  type LayoutOptions,
  type LayoutPoint,
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

const radiusFor = (degree: number): number =>
  4 + Math.min(9, Math.sqrt(degree) * 2.4);

// A bigger graph needs more room, or every node piles into the middle and the
// result is the hairball the user saw at depth 3.
const optionsForSize = (count: number): LayoutOptions => ({
  ...DEFAULT_LAYOUT_OPTIONS,
  linkDistance: Math.min(150, 70 + count * 0.18),
  repulsion: Math.min(16000, 4200 + count * 28),
  centerStrength: count > 120 ? 0.02 : 0.012,
});

interface GraphViewProps {
  // Local graph when set; whole workspace when absent.
  focusNodeId?: string;
  className?: string;
}

export const GraphView = ({ focusNodeId, className }: GraphViewProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  const [edgeMode, setEdgeMode] = useState<GraphEdgeMode>('both');
  const [includeOrphans, setIncludeOrphans] = useState(false);
  // A page's own graph opens on what sits directly around it. Two hops already
  // pulls in the neighbours' neighbours, which is most of a space.
  const [depth, setDepth] = useState(focusNodeId ? 1 : 2);
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 800, height: 600 });

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement | null>());
  const edgeRefs = useRef<Array<SVGLineElement | null>>([]);
  const pointsRef = useRef<LayoutPoint[]>([]);
  const pointIndex = useRef(new Map<string, LayoutPoint>());
  const draggingRef = useRef<{ id: string | null; panFrom: { x: number; y: number } | null }>({
    id: null,
    panFrom: null,
  });

  const graphQuery = useLiveQuery({
    type: 'node.graph.get',
    userId: workspace.userId,
    edgeMode,
    includeOrphans,
    focusNodeId: focusNodeId ?? null,
    depth,
    maxNodes: MAX_NODES,
  });

  const graph = graphQuery.data;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The simulation drives the DOM directly. Re-rendering ~280 groups and ~900
  // lines through React on every frame would make the animation the slowest
  // part of the app; writing transforms on the nodes we already rendered costs
  // nothing and is what makes it feel alive rather than appear fully formed.
  const paint = useCallback(() => {
    for (const point of pointsRef.current) {
      const element = nodeRefs.current.get(point.id);
      if (element) {
        element.setAttribute('transform', `translate(${point.x} ${point.y})`);
      }
    }
    const edges = graph?.edges ?? [];
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
  }, [graph]);

  const runningRef = useRef<number | null>(null);
  const startSimulation = useCallback(() => {
    if (!graph || graph.nodes.length === 0) {
      return;
    }
    if (runningRef.current !== null) {
      cancelAnimationFrame(runningRef.current);
    }
    const options = optionsForSize(graph.nodes.length);
    let frames = 0;
    const loop = () => {
      const moved = stepLayout(pointsRef.current, graph.edges, options);
      paint();
      frames++;
      if (draggingRef.current.id || (moved > SETTLE_THRESHOLD && frames < MAX_FRAMES)) {
        runningRef.current = requestAnimationFrame(loop);
      } else {
        runningRef.current = null;
      }
    };
    runningRef.current = requestAnimationFrame(loop);
  }, [graph, paint]);

  useEffect(() => {
    if (!graph || graph.nodes.length === 0) {
      pointsRef.current = [];
      pointIndex.current = new Map();
      return;
    }
    pointsRef.current = seedPositions(
      graph.nodes.map((n) => n.id),
      Math.max(26, 70 - graph.nodes.length / 10)
    );
    const index = new Map<string, LayoutPoint>();
    for (const point of pointsRef.current) {
      index.set(point.id, point);
    }
    pointIndex.current = index;
    startSimulation();
    return () => {
      if (runningRef.current !== null) {
        cancelAnimationFrame(runningRef.current);
        runningRef.current = null;
      }
    };
  }, [graph, startSimulation]);

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

  const isDimmed = (id: string): boolean => {
    if (matches) {
      return !matches.has(id);
    }
    if (!hovered) {
      return false;
    }
    return id !== hovered && !neighbours.get(hovered)?.has(id);
  };

  const toScene = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: (clientX - rect.left - rect.width / 2 - view.x) / view.zoom,
      y: (clientY - rect.top - rect.height / 2 - view.y) / view.zoom,
    };
  };

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    setView((v) => ({
      ...v,
      zoom: Math.min(4, Math.max(0.12, v.zoom * (event.deltaY < 0 ? 1.12 : 0.89))),
    }));
  };

  const onPointerDown = (event: React.PointerEvent) => {
    draggingRef.current.panFrom = {
      x: event.clientX - view.x,
      y: event.clientY - view.y,
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
      setView((v) => ({ ...v, x: event.clientX - from.x, y: event.clientY - from.y }));
    }
  };

  const onPointerUp = () => {
    draggingRef.current.id = null;
    draggingRef.current.panFrom = null;
  };

  const labelOpacity = view.zoom < 0.45 ? 0 : Math.min(1, (view.zoom - 0.45) * 3);

  if (graphQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Building the graph…
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nothing to draw here yet.</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Mention another page with @ and it appears in this graph. Switch to
          Nesting to see how this corner of the wiki is arranged instead.
        </p>
      </div>
    );
  }

  const linkCount = graph.edges.filter((e) => e.kind === 'link').length;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
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
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={includeOrphans ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setIncludeOrphans((v) => !v)}
            >
              Orphans
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Also show pages that are neither linked nor nested
          </TooltipContent>
        </Tooltip>
        {focusNodeId && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Depth</span>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  aria-label="Show fewer hops"
                  onClick={() => setDepth((d) => Math.max(1, d - 1))}
                >
                  <Minus className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fewer hops from this page</TooltipContent>
            </Tooltip>
            <span className="w-3 text-center tabular-nums text-foreground">
              {depth}
            </span>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
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
              onClick={() => {
                setView({ x: 0, y: 0, zoom: 1 });
                startSimulation();
              }}
            >
              <Maximize2 className="size-3.5" />
              Reset
            </Button>
          </TooltipTrigger>
          <TooltipContent>Recentre the view and shake the layout out</TooltipContent>
        </Tooltip>
        <span className="ml-auto text-xs text-muted-foreground">
          {graph.truncated && (
            <span
              data-testid="graph-truncated"
              className="mr-2 text-amber-600 dark:text-amber-500"
            >
              too many to draw — showing the {graph.truncated.shown} best
              connected of {graph.truncated.total}
            </span>
          )}
          {graph.nodes.length} nodes · {linkCount} links ·{' '}
          {graph.edges.length - linkCount} nested
          {graph.unresolved.length > 0 && (
            <span className="ml-2 text-amber-600 dark:text-amber-500">
              {graph.unresolved.length} unresolved
            </span>
          )}
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
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
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {graph.edges.map((edge, i) => {
              const dim = isDimmed(edge.from) && isDimmed(edge.to);
              return (
                <line
                  key={`${edge.kind}:${edge.from}>${edge.to}`}
                  ref={(el) => {
                    edgeRefs.current[i] = el;
                  }}
                  className={cn(
                    'stroke-muted-foreground transition-opacity',
                    edge.kind === 'hierarchy' ? 'opacity-25' : 'opacity-50',
                    dim && 'opacity-5'
                  )}
                  strokeWidth={edge.kind === 'link' ? 1.2 : 0.8}
                  strokeDasharray={edge.kind === 'hierarchy' ? '3 3' : undefined}
                />
              );
            })}

            {graph.nodes.map((node) => {
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
                      TYPE_FILL[node.type] ?? 'fill-slate-400',
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

        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 rounded-md border bg-background/85 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
          {Object.entries(TYPE_DOT).map(([type, dot]) => (
            <span key={type} className="flex items-center gap-1">
              <span className={cn('size-2 rounded-full', dot)} />
              {type}
            </span>
          ))}
          <span className="ml-1 border-l pl-2">drag a node to move it</span>
        </div>
      </div>
    </div>
  );
};
