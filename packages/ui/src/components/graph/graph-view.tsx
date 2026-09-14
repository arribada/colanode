// ABOUTME: Knowledge-graph canvas — a settled force layout of the workspace's
// ABOUTME: mentions and hierarchy, drawn as SVG with pan, zoom and highlighting.
import { useNavigate } from '@tanstack/react-router';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import type { GraphEdgeMode } from '@colanode/client/lib';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import {
  DEFAULT_LAYOUT_OPTIONS,
  layoutBounds,
  runLayout,
  seedPositions,
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

const EDGE_MODES: { value: GraphEdgeMode; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'links', label: 'Links' },
  { value: 'hierarchy', label: 'Hierarchy' },
];

const radiusFor = (degree: number): number =>
  4 + Math.min(9, Math.sqrt(degree) * 2.4);

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
  const [depth, setDepth] = useState(2);
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const graphQuery = useLiveQuery({
    type: 'node.graph.get',
    userId: workspace.userId,
    edgeMode,
    includeOrphans,
    focusNodeId: focusNodeId ?? null,
    depth,
  });

  const graph = graphQuery.data;

  // The layout is settled once per data change rather than animated frame by
  // frame: at wiki scale the simulation is O(n^2) per tick, and a static result
  // reads better than a canvas that never stops breathing.
  const points = useMemo(() => {
    if (!graph || graph.nodes.length === 0) {
      return [] as LayoutPoint[];
    }
    const seeded = seedPositions(
      graph.nodes.map((n) => n.id),
      Math.max(24, 60 - graph.nodes.length / 12)
    );
    const ticks = Math.min(400, 120 + graph.nodes.length);
    runLayout(seeded, graph.edges, ticks, DEFAULT_LAYOUT_OPTIONS);
    return seeded;
  }, [graph]);

  const positions = useMemo(() => {
    const map = new Map<string, LayoutPoint>();
    for (const p of points) {
      map.set(p.id, p);
    }
    return map;
  }, [points]);

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of graph?.edges ?? []) {
      (map.get(edge.from) ?? map.set(edge.from, new Set()).get(edge.from))!.add(
        edge.to
      );
      (map.get(edge.to) ?? map.set(edge.to, new Set()).get(edge.to))!.add(
        edge.from
      );
    }
    return map;
  }, [graph]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !graph) {
      return null;
    }
    return new Set(
      graph.nodes
        .filter((n) => n.name.toLowerCase().includes(term))
        .map((n) => n.id)
    );
  }, [search, graph]);

  const box = useMemo(() => layoutBounds(points), [points]);
  const width = Math.max(200, box.maxX - box.minX + 160);
  const height = Math.max(200, box.maxY - box.minY + 160);

  const isDimmed = (id: string): boolean => {
    if (matches) {
      return !matches.has(id);
    }
    if (!hovered) {
      return false;
    }
    return id !== hovered && !neighbours.get(hovered)?.has(id);
  };

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    setView((v) => ({
      ...v,
      zoom: Math.min(4, Math.max(0.15, v.zoom * (event.deltaY < 0 ? 1.12 : 0.89))),
    }));
  };

  const onPointerDown = (event: React.PointerEvent) => {
    dragRef.current = { x: event.clientX - view.x, y: event.clientY - view.y };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start) {
      return;
    }
    setView((v) => ({ ...v, x: event.clientX - start.x, y: event.clientY - start.y }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

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
        <p className="text-sm text-muted-foreground">
          Nothing to draw here yet.
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          Mention another page with @ and it appears in this graph. Turn on
          Hierarchy to see how this corner of the wiki is nested instead.
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
            <Button
              key={mode.value}
              type="button"
              size="sm"
              variant={edgeMode === mode.value ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setEdgeMode(mode.value)}
            >
              {mode.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant={includeOrphans ? 'secondary' : 'ghost'}
          className="h-7 px-2 text-xs"
          onClick={() => setIncludeOrphans((v) => !v)}
        >
          Orphans
        </Button>
        {focusNodeId && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Depth</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-7 p-0"
              onClick={() => setDepth((d) => Math.max(1, d - 1))}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-3 text-center tabular-nums text-foreground">
              {depth}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-7 p-0"
              onClick={() => setDepth((d) => Math.min(5, d + 1))}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        )}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Highlight…"
          className="h-7 w-40 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setView({ x: 0, y: 0, zoom: 1 })}
        >
          <Maximize2 className="size-3.5" />
          Reset
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
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
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg className="size-full select-none" role="img" aria-label="Knowledge graph">
          <g
            transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
            style={{ transformOrigin: 'center' }}
          >
            <g transform={`translate(${width / 2 - (box.minX + box.maxX) / 2} ${height / 2 - (box.minY + box.maxY) / 2})`}>
              {graph.edges.map((edge) => {
                const a = positions.get(edge.from);
                const b = positions.get(edge.to);
                if (!a || !b) {
                  return null;
                }
                const dim = isDimmed(edge.from) && isDimmed(edge.to);
                return (
                  <line
                    key={`${edge.kind}:${edge.from}>${edge.to}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
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
                const p = positions.get(node.id);
                if (!p) {
                  return null;
                }
                const dim = isDimmed(node.id);
                const r = radiusFor(node.degree);
                const isFocus = node.id === focusNodeId;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${p.x} ${p.y})`}
                    className={cn(
                      'cursor-pointer transition-opacity',
                      dim && 'opacity-20'
                    )}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() =>
                      navigate({
                        to: '/workspace/$userId/$nodeId',
                        params: { userId: workspace.userId, nodeId: node.id },
                      })
                    }
                  >
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
          </g>
        </svg>

        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 rounded-md border bg-background/85 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
          {Object.entries(TYPE_DOT).map(([type, dot]) => (
            <span key={type} className="flex items-center gap-1">
              <span className={cn('size-2 rounded-full', dot)} />
              {type}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
