// ABOUTME: One timeline row's bar -- a link to the record that can also be
// ABOUTME: dragged to reschedule it: whole bar moves both dates, edges resize.

import { useRef, useState } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import {
  FieldAttributes,
  extractNodeRole,
  hasNodeRole,
} from '@colanode/core';
import {
  barGeometry,
  DAY_MS,
  dayDeltaFromPx,
  shiftedUtcIso,
  TimelineBar,
  TimelineRange,
  TimelineScale,
} from '@colanode/ui/components/databases/timelines/timeline';
import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

// Short form for drawing inside the bar, where the year is usually obvious
// from the axis band directly above it.
const formatShort = (date: Date): string =>
  `${String(date.getUTCDate()).padStart(2, '0')}/${String(
    date.getUTCMonth() + 1
  ).padStart(2, '0')}`;

const formatDay = (date: Date): string =>
  `${String(date.getUTCDate()).padStart(2, '0')}/${String(
    date.getUTCMonth() + 1
  ).padStart(2, '0')}/${date.getUTCFullYear()}`;

// Below this the label would be clipped mid-digit, so the bar stays plain and
// the dates live in its tooltip instead.
const LABEL_MIN_WIDTH = 104;

// Movement under this many pixels is a click, not a drag -- so tapping a bar
// still opens the record instead of nudging it by a day.
const DRAG_THRESHOLD_PX = 4;

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface DragState {
  mode: DragMode;
  startX: number;
  dayDelta: number;
  moved: boolean;
}

interface TimelineViewBarProps {
  record: LocalRecordNode;
  bar: TimelineBar;
  range: TimelineRange;
  scale: TimelineScale;
  colorClass: string;
  startField: FieldAttributes | undefined;
  endField: FieldAttributes | undefined;
}

export const TimelineViewBar = ({
  record,
  bar,
  range,
  scale,
  colorClass,
  startField,
  endField,
}: TimelineViewBarProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  // Per-record editability, mirroring RecordProvider so a bar obeys the same
  // lock rules a record page would. The timeline lists raw records rather than
  // wrapping each in a RecordProvider, so recompute it here.
  const role = extractNodeRole(record, workspace.userId) ?? database.role;
  const isPrivileged =
    record.createdBy === workspace.userId || hasNodeRole(role, 'admin');
  const lockMode = record.lockMode ?? 'open';
  const canEditRecord =
    !database.isLocked &&
    (record.createdBy === workspace.userId || hasNodeRole(role, 'editor')) &&
    (isPrivileged || lockMode === 'open');

  // created_at / updated_at are server-derived timestamps: real bars, but no
  // field to write back to, so those ends never accept a drag.
  const canEditStart = canEditRecord && startField?.type === 'date';
  const canEditEnd = canEditRecord && endField?.type === 'date';

  // A live preview so the bar follows the pointer; committed on pointer-up.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Set on the drag that just ended so the click it also fires does not also
  // navigate to the record.
  const suppressClick = useRef(false);

  const startFieldId = startField?.id;
  const endFieldId = endField?.id;

  const commit = (mode: DragMode, days: number) => {
    if (days === 0) {
      return;
    }

    workspace.collections.nodes.update(record.id, (draft) => {
      if (draft.type !== 'record') {
        return;
      }

      if (
        (mode === 'move' || mode === 'resize-start') &&
        canEditStart &&
        startFieldId
      ) {
        draft.fields[startFieldId] = {
          type: 'string',
          value: shiftedUtcIso(bar.start, days),
        };
      }

      if (
        (mode === 'move' || mode === 'resize-end') &&
        !bar.isMilestone &&
        canEditEnd &&
        endFieldId
      ) {
        draft.fields[endFieldId] = {
          type: 'string',
          value: shiftedUtcIso(bar.end, days),
        };
      }
    });
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    mode: DragMode
  ) => {
    // Only the primary (left) button drags; right / middle keep their meaning.
    if (event.button !== 0) {
      return;
    }

    const allowed =
      mode === 'resize-start'
        ? canEditStart
        : mode === 'resize-end'
          ? canEditEnd
          : // A whole-bar move shifts both ends; a milestone has only a start.
            bar.isMilestone
            ? canEditStart
            : canEditStart && canEditEnd;

    if (!allowed) {
      return;
    }

    const state: DragState = {
      mode,
      startX: event.clientX,
      dayDelta: 0,
      moved: false,
    };
    suppressClick.current = false;
    dragRef.current = state;
    setDrag(state);
    event.currentTarget.setPointerCapture(event.pointerId);
    // Edge grips must not also start a whole-bar move, nor navigate.
    event.stopPropagation();
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) {
      return;
    }

    const dx = event.clientX - current.startX;
    const moved = current.moved || Math.abs(dx) >= DRAG_THRESHOLD_PX;
    const dayDelta = dayDeltaFromPx(dx, scale);

    // Resizing may not cross the opposite end: a start dragged past the end (or
    // vice versa) would invert the bar, which buildTimelineBars treats as bad
    // data. Clamp so the bar stays at least one day long.
    let clamped = dayDelta;
    if (current.mode === 'resize-start') {
      const maxForward = (bar.end.getTime() - bar.start.getTime()) / DAY_MS;
      clamped = Math.min(dayDelta, maxForward);
    } else if (current.mode === 'resize-end') {
      const maxBackward = -(bar.end.getTime() - bar.start.getTime()) / DAY_MS;
      clamped = Math.max(dayDelta, maxBackward);
    }

    const next: DragState = { ...current, dayDelta: clamped, moved };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    dragRef.current = null;
    if (!current) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    // Only swallow the follow-up navigation click when a real reschedule
    // happened (a sub-day drag rounds to 0 days -> treat it as a click so the
    // record still opens).
    if (current.moved && current.dayDelta !== 0) {
      suppressClick.current = true;
      commit(current.mode, current.dayDelta);
    }
    setDrag(null);
  };

  // A cancelled pointer (touch interruption, OS gesture) must NOT commit or arm
  // suppressClick -- otherwise the next genuine click gets eaten.
  const cancelDrag = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  };

  // Preview geometry: reflect the in-flight drag so the bar tracks the pointer.
  const previewStart =
    drag && (drag.mode === 'move' || drag.mode === 'resize-start')
      ? drag.dayDelta
      : 0;
  const previewEnd =
    drag && (drag.mode === 'move' || drag.mode === 'resize-end')
      ? drag.dayDelta
      : 0;

  const displayStart = new Date(bar.start.getTime() + previewStart * DAY_MS);
  const displayEnd = new Date(bar.end.getTime() + previewEnd * DAY_MS);
  const displayBar: TimelineBar = {
    ...bar,
    start: displayStart,
    end: displayEnd,
  };
  const geometry = barGeometry(displayBar, range, scale);

  const name = record.name && record.name !== '' ? record.name : 'Unnamed';
  const dragging = drag !== null && drag.moved;
  const canMove = bar.isMilestone
    ? canEditStart
    : canEditStart && canEditEnd;

  return (
    <Link
      from="/workspace/$userId/$nodeId"
      to="modal/$modalNodeId"
      params={{ modalNodeId: record.id }}
      data-testid={`timeline-bar-${record.id}`}
      title={
        bar.isMilestone
          ? `${name} — ${formatDay(displayBar.start)}`
          : `${name} — ${formatDay(displayBar.start)} → ${formatDay(displayBar.end)}`
      }
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerDown={(event) => {
        if (canMove) {
          beginDrag(event, 'move');
        }
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
      className={cn(
        'group/timeline-bar absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-between',
        'overflow-visible rounded-md px-1.5 hover:brightness-110',
        colorClass,
        canMove && !dragging && 'cursor-grab',
        dragging && 'cursor-grabbing select-none',
        bar.isMilestone &&
          'rotate-45 rounded-sm px-0 ring-1 ring-background'
      )}
      style={{
        left: geometry.left,
        width: bar.isMilestone ? 12 : geometry.width,
        height: bar.isMilestone ? 12 : 18,
      }}
    >
      {/* Left grip: resizes only the start date. */}
      {!bar.isMilestone && canEditStart && (
        <span
          role="presentation"
          onPointerDown={(event) => beginDrag(event, 'resize-start')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize rounded-l-md opacity-0 group-hover/timeline-bar:opacity-100 group-hover/timeline-bar:bg-black/20"
        />
      )}

      {/* The dates ride on the bar once there is room, so a start and an end
          can be read without hovering. */}
      {!bar.isMilestone && geometry.width >= LABEL_MIN_WIDTH && (
        <>
          <span className="pointer-events-none truncate text-[10px] font-medium text-white/90">
            {formatShort(displayBar.start)}
          </span>
          <span className="pointer-events-none truncate text-[10px] font-medium text-white/90">
            {formatShort(displayBar.end)}
          </span>
        </>
      )}

      {/* Right grip: resizes only the end date. */}
      {!bar.isMilestone && canEditEnd && (
        <span
          role="presentation"
          onPointerDown={(event) => beginDrag(event, 'resize-end')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover/timeline-bar:opacity-100 group-hover/timeline-bar:bg-black/20"
        />
      )}
    </Link>
  );
};
