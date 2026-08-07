// ABOUTME: Hover-driven row/column grab handles overlaid on an editor table —
// ABOUTME: click to select the whole row/column, drag to reorder it.
import { type Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  captureAxisId,
  reorderTableColumn,
  reorderTableRow,
  resolveAxisIndex,
  selectTableColumn,
  selectTableRow,
} from '@colanode/ui/editor/views/table-reorder';
import { cn } from '@colanode/ui/lib/utils';

// Geometry, all in pixels relative to the table's `relative` container.
interface RowMetric {
  top: number;
  height: number;
}
interface ColMetric {
  left: number;
  width: number;
}
interface Metrics {
  rows: RowMetric[];
  cols: ColMetric[];
  width: number;
  height: number;
}

type Axis = 'row' | 'col';
type DragState = { axis: Axis; from: number; gap: number };

interface TableHandlesProps {
  editor: Editor;
  getPos: () => number | undefined;
  // The table's inner "relative" box — used to MEASURE row/column geometry.
  containerRef: React.RefObject<HTMLDivElement | null>;
  // The outer wrapper (table + its padding margins where the handles sit) —
  // used to TRACK hover, so moving out to grab a handle isn't seen as leaving.
  hoverRef: React.RefObject<HTMLDivElement | null>;
}

// The grab bar's size on its cross axis (row bars are this wide, column bars this
// tall) and how far it sits outside the table. Kept inside the container's
// existing top padding / left margin so showing a handle never shifts layout.
const HANDLE_THICKNESS = 8;
const HANDLE_OFFSET = HANDLE_THICKNESS + 2;
// Pointer travel (px) before a press is treated as a drag rather than a click.
const DRAG_THRESHOLD = 4;

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

const metricsEqual = (a: Metrics | null, b: Metrics | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.rows.length !== b.rows.length || a.cols.length !== b.cols.length) {
    return false;
  }
  if (!near(a.width, b.width) || !near(a.height, b.height)) return false;
  for (let i = 0; i < a.rows.length; i++) {
    const ra = a.rows[i]!;
    const rb = b.rows[i]!;
    if (!near(ra.top, rb.top) || !near(ra.height, rb.height)) return false;
  }
  for (let i = 0; i < a.cols.length; i++) {
    const ca = a.cols[i]!;
    const cb = b.cols[i]!;
    if (!near(ca.left, cb.left) || !near(ca.width, cb.width)) return false;
  }
  return true;
};

// Gap coordinates: one per row/column boundary, plus the trailing edge.
const rowGaps = (m: Metrics): number[] => {
  const gaps = m.rows.map((r) => r.top);
  const last = m.rows[m.rows.length - 1];
  gaps.push(last ? last.top + last.height : 0);
  return gaps;
};
const colGaps = (m: Metrics): number[] => {
  const gaps = m.cols.map((c) => c.left);
  const last = m.cols[m.cols.length - 1];
  gaps.push(last ? last.left + last.width : 0);
  return gaps;
};
const nearestGap = (positions: number[], value: number): number => {
  let best = 0;
  let bestDist = Infinity;
  positions.forEach((p, i) => {
    const d = Math.abs(p - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
};

export const TableHandles = ({
  editor,
  getPos,
  containerRef,
  hoverRef,
}: TableHandlesProps) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [visible, setVisible] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Live drag bookkeeping kept in refs so window/pointer handlers read fresh
  // values without re-subscribing.
  const dragRef = useRef<DragState | null>(null);
  const draggingRef = useRef(false); // crossed the threshold → suppress the click
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  // Block id of the grabbed row/column, captured at pointer-down so the drop can
  // re-resolve its CURRENT index (guards against a concurrent structural edit
  // moving the wrong line).
  const dragFromIdRef = useRef<string | null>(null);

  // Measure the real rendered geometry from the DOM (via getBoundingClientRect)
  // so the handles line up with the re-resizable cells at any column width, and
  // re-align after a resize / scroll / edit. All values are container-relative,
  // which makes them invariant under scrolling.
  const measure = useCallback((): Metrics | null => {
    const container = containerRef.current;
    if (!container) return null;
    const table = container.querySelector(':scope > table') as
      | HTMLTableElement
      | null;
    if (!table) return null;
    const cRect = container.getBoundingClientRect();
    const rowEls = Array.from(table.rows);
    if (rowEls.length === 0) return null;
    const rows: RowMetric[] = rowEls.map((r) => {
      const rr = r.getBoundingClientRect();
      return { top: rr.top - cRect.top, height: rr.height };
    });
    const firstRow = rowEls[0]!;
    const cols: ColMetric[] = Array.from(firstRow.cells).map((c) => {
      const cr = c.getBoundingClientRect();
      return { left: cr.left - cRect.left, width: cr.width };
    });
    const tRect = table.getBoundingClientRect();
    return {
      rows,
      cols,
      width: tRect.width,
      height: tRect.height,
    };
  }, [containerRef]);

  const applyMeasure = useCallback(() => {
    setMetrics((prev) => {
      const next = measure();
      return metricsEqual(prev, next) ? prev : next;
    });
  }, [measure]);

  // Hover tracking + geometry refresh. Positions are recomputed lazily on
  // mousemove (rAF-throttled) and whenever the table resizes, so the handles
  // follow column resizes and content edits without a render loop.
  useEffect(() => {
    const hover = hoverRef.current;
    const container = containerRef.current;
    if (!hover || !container) return;

    const onEnter = () => {
      setVisible(true);
      applyMeasure();
    };
    const onMove = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        applyMeasure();
      });
    };
    // Hover is tracked on the OUTER wrapper (table + padding margins where the
    // handles live), so moving the pointer out to grab a handle is not treated
    // as leaving — the handles no longer disappear the moment you reach for them.
    const onLeave = (event: MouseEvent) => {
      if (draggingRef.current) return;
      const related = event.relatedTarget as Node | null;
      if (related && hover.contains(related)) return;
      setVisible(false);
    };

    hover.addEventListener('mouseenter', onEnter);
    hover.addEventListener('mousemove', onMove);
    hover.addEventListener('mouseleave', onLeave);

    const table = container.querySelector(':scope > table');
    const ro = table
      ? new ResizeObserver(() => {
          applyMeasure();
        })
      : null;
    ro?.observe(table!);

    return () => {
      hover.removeEventListener('mouseenter', onEnter);
      hover.removeEventListener('mousemove', onMove);
      hover.removeEventListener('mouseleave', onLeave);
      ro?.disconnect();
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // If the table unmounts mid-drag, drop the global drag affordance so the
      // body isn't left stuck with grabbing cursor / disabled text selection,
      // and clear the drag bookkeeping. Refs only — no setState on unmount.
      document.body.classList.remove('colanode-table-dragging');
      dragRef.current = null;
      draggingRef.current = false;
      pointerStart.current = null;
      dragFromIdRef.current = null;
    };
  }, [hoverRef, containerRef, applyMeasure]);

  const endDragCleanup = () => {
    document.body.classList.remove('colanode-table-dragging');
    dragRef.current = null;
    pointerStart.current = null;
    dragFromIdRef.current = null;
    setDrag(null);
  };

  const onPointerDown = (
    axis: Axis,
    index: number,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (event.button !== 0) return;
    // Keep ProseMirror from moving the caret / starting a text selection.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = { x: event.clientX, y: event.clientY };
    draggingRef.current = false;
    // Remember the grabbed row/column by its stable block id so the drop can
    // re-resolve its current index even if the table changed underneath.
    const pos = getPos();
    dragFromIdRef.current =
      pos === undefined
        ? null
        : captureAxisId(editor.view.state, pos, axis, index);
    // Do NOT set React `drag` yet: only a real drag (past threshold) shows the
    // indicator, so a plain click still falls through to onClick → select.
    dragRef.current = { axis, from: index, gap: index };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    const current = dragRef.current;
    if (!start || !current) return;

    if (!draggingRef.current) {
      const dist = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (dist < DRAG_THRESHOLD) return;
      draggingRef.current = true;
      document.body.classList.add('colanode-table-dragging');
    }

    const m = measure();
    const container = containerRef.current;
    if (!m || !container) return;
    if (!metricsEqual(metrics, m)) setMetrics(m);

    const cRect = container.getBoundingClientRect();
    const gap =
      current.axis === 'row'
        ? nearestGap(rowGaps(m), event.clientY - cRect.top)
        : nearestGap(colGaps(m), event.clientX - cRect.left);

    const nextDrag: DragState = { axis: current.axis, from: current.from, gap };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    const wasDrag = draggingRef.current;
    const fromId = dragFromIdRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endDragCleanup();

    if (!current || !wasDrag) {
      // A click, not a drag: onClick handles selection. Leave draggingRef false.
      return;
    }

    const pos = getPos();
    if (pos !== undefined) {
      // Re-resolve the grabbed line's CURRENT index from its captured block id:
      // a concurrent structural edit may have shifted indices since pointer-down,
      // and moving the stale `from` would relocate the wrong row/column. If the
      // id can't be read (fallback) use the captured index; if it's gone, abort.
      let fromIndex: number | null = current.from;
      if (fromId !== null) {
        const resolved = resolveAxisIndex(
          editor.view.state,
          pos,
          current.axis,
          fromId
        );
        fromIndex = resolved < 0 ? null : resolved;
      }
      if (fromIndex === null) {
        toast("Can't reorder — that row or column changed");
      } else {
        const result =
          current.axis === 'row'
            ? reorderTableRow(editor, pos, fromIndex, current.gap)
            : reorderTableColumn(editor, pos, fromIndex, current.gap);
        if (result === 'merged') {
          toast("Can't reorder across merged cells");
        }
      }
    }
    // Suppress the click the browser synthesizes right after this pointerup.
    window.requestAnimationFrame(() => {
      draggingRef.current = false;
    });
  };

  const onPointerCancel = () => {
    if (!dragRef.current) return;
    endDragCleanup();
    window.requestAnimationFrame(() => {
      draggingRef.current = false;
    });
  };

  const selectAxis = (axis: Axis, index: number) => {
    if (draggingRef.current) return;
    const pos = getPos();
    if (pos === undefined) return;
    if (axis === 'row') {
      selectTableRow(editor, pos, index);
    } else {
      selectTableColumn(editor, pos, index);
    }
  };

  const onKeyDown = (
    axis: Axis,
    index: number,
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAxis(axis, index);
    }
  };

  if ((!visible && !drag) || !metrics) {
    return null;
  }

  const handleBase =
    'pointer-events-auto absolute rounded-full bg-muted-foreground/25 shadow-sm ' +
    'ring-1 ring-inset ring-border/50 transition-all duration-150 ' +
    'hover:bg-primary hover:ring-primary hover:shadow focus-visible:bg-primary ' +
    'focus-visible:outline-none cursor-grab active:cursor-grabbing';

  return (
    <div
      contentEditable={false}
      className="pointer-events-none absolute inset-0 z-30 select-none"
    >
      {/* Column handles — thin bars above each column. */}
      {metrics.cols.map((c, i) => (
        <button
          key={`col-${i}`}
          type="button"
          aria-label={`Select column ${i + 1}`}
          title="Click to select column, drag to reorder"
          data-testid={`editor-table-col-handle-${i}`}
          className={cn(
            handleBase,
            drag?.axis === 'col' &&
              drag.from === i &&
              'bg-primary cursor-grabbing'
          )}
          style={{
            left: c.left,
            width: c.width,
            top: -HANDLE_OFFSET,
            height: HANDLE_THICKNESS,
            touchAction: 'none',
          }}
          onPointerDown={(e) => onPointerDown('col', i, e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={() => selectAxis('col', i)}
          onKeyDown={(e) => onKeyDown('col', i, e)}
        />
      ))}

      {/* Row handles — thin bars in the left gutter of each row. */}
      {metrics.rows.map((r, i) => (
        <button
          key={`row-${i}`}
          type="button"
          aria-label={`Select row ${i + 1}`}
          title="Click to select row, drag to reorder"
          data-testid={`editor-table-row-handle-${i}`}
          className={cn(
            handleBase,
            drag?.axis === 'row' &&
              drag.from === i &&
              'bg-primary cursor-grabbing'
          )}
          style={{
            top: r.top,
            height: r.height,
            left: -HANDLE_OFFSET,
            width: HANDLE_THICKNESS,
            touchAction: 'none',
          }}
          onPointerDown={(e) => onPointerDown('row', i, e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={() => selectAxis('row', i)}
          onKeyDown={(e) => onKeyDown('row', i, e)}
        />
      ))}

      {/* Drop indicator at the current target gap. */}
      {drag && drag.axis === 'row' && (
        <div
          className="pointer-events-none absolute rounded-full bg-primary"
          style={{
            left: 0,
            width: metrics.width,
            top: (rowGaps(metrics)[drag.gap] ?? 0) - 1,
            height: 2,
          }}
        />
      )}
      {drag && drag.axis === 'col' && (
        <div
          className="pointer-events-none absolute rounded-full bg-primary"
          style={{
            top: 0,
            height: metrics.height,
            left: (colGaps(metrics)[drag.gap] ?? 0) - 1,
            width: 2,
          }}
        />
      )}
    </div>
  );
};
