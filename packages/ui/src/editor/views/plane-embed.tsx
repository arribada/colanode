import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import {
  ExternalLink,
  FolderKanban,
  GanttChartSquare,
  List,
  RotateCw,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { PlaneBoardIssue, PlaneProjectBoardOutput } from '@colanode/core';
import {
  barGeometry,
  buildTimelineBands,
  buildTimelinePeriods,
  dayDiff,
  PX_PER_DAY,
  parseTimelineDate,
  startOfUtcDay,
  TimelineBar,
  timelineRange,
  TimelineScale,
} from '@colanode/ui/components/databases/timelines/timeline';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { cn } from '@colanode/ui/lib/utils';

const MAX_HEIGHT = 340;

// Fixed scale for the embed. The DB timeline lets the user pick day/week/month;
// inline in a document, one sensible default keeps the block compact — 'week'
// reads a multi-month project without an enormous horizontal scroll.
const EMBED_SCALE: TimelineScale = 'week';
// Frozen left column holding each issue's key + name, mirroring the DB Gantt.
const NAME_WIDTH = 200;
const ROW_HEIGHT = 30;

const formatDay = (date: Date): string =>
  `${String(date.getUTCDate()).padStart(2, '0')}/${String(
    date.getUTCMonth() + 1
  ).padStart(2, '0')}/${date.getUTCFullYear()}`;

// A read-only external link — a real anchor (works everywhere, opens a new
// tab) plus the Electron hook, mirroring the bookmark block. Nothing here ever
// writes back to Plane.
const openInPlane = (url: string) => window.colanode.openExternalUrl(url);

const priorityColor = (priority: string): string | null => {
  switch (priority) {
    case 'urgent':
      return '#EF4444';
    case 'high':
      return '#F97316';
    case 'medium':
      return '#EAB308';
    case 'low':
      return '#3B82F6';
    default:
      return null;
  }
};

// A small, keyboard-accessible button that re-runs the board/projects query.
// Used both for error recovery and for an explicit manual reload.
const PlaneRetryButton = ({
  onRetry,
  busy,
  label,
  compact = false,
}: {
  onRetry: () => void;
  busy: boolean;
  label: string;
  compact?: boolean;
}) => (
  <button
    type="button"
    onClick={onRetry}
    disabled={busy}
    aria-label={label}
    title={compact ? label : undefined}
    className={
      compact
        ? 'flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60'
        : 'inline-flex items-center gap-1.5 rounded border border-border/60 bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60'
    }
  >
    {busy ? (
      <Spinner className="size-3.5" />
    ) : (
      <RotateCw className="size-3.5" />
    )}
    {compact ? null : 'Retry'}
  </button>
);

const PlaneIssueLinkRow = ({
  issue,
  color,
}: {
  issue: PlaneBoardIssue;
  color: string;
}) => {
  const pColor = priorityColor(issue.priority);
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openInPlane(issue.url);
      }}
      className="group/row flex items-center gap-2 px-3 py-1.5 text-sm no-underline transition-colors hover:bg-accent"
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {issue.key}
      </span>
      <span className="shrink-0 text-muted-foreground">&middot;</span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {issue.name}
      </span>
      {issue.priority !== 'none' && pColor ? (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: pColor }}
          title={issue.priority}
        />
      ) : null}
      <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
    </a>
  );
};

// A compact quick-link pill to one of the project's Plane surfaces.
const PlaneQuickLink = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => {
      e.preventDefault();
      openInPlane(href);
    }}
    className="rounded border border-border/60 bg-background px-2 py-0.5 text-xs text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
  >
    {label}
  </a>
);

// Editable empty state — a project picker backed by `plane.projects.list`.
const PlaneEmbedPicker = ({
  updateAttributes,
}: {
  updateAttributes: NodeViewProps['updateAttributes'];
}) => {
  const workspace = useWorkspace();
  const { data, isLoading, isError, isFetching, refetch } = useQuery(
    { type: 'plane.projects.list', userId: workspace.userId },
    { staleTime: 60_000, retry: false }
  );

  return (
    <div
      contentEditable={false}
      className="my-1 select-none rounded-md border border-border/60 bg-muted/30 p-3"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
        Plane project
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading projects&hellip;
        </div>
      ) : isError || !data ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load Plane projects. Check that the integration is
            enabled.
          </p>
          <PlaneRetryButton
            onRetry={() => refetch()}
            busy={isFetching}
            label="Retry loading Plane projects"
          />
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Plane projects available.
        </p>
      ) : (
        <select
          defaultValue=""
          aria-label="Choose a Plane project"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const projectId = e.target.value;
            if (projectId) {
              updateAttributes({ projectId });
            }
          }}
          className="w-full rounded border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground outline-none"
        >
          <option value="" disabled>
            Choose a project&hellip;
          </option>
          {[...data]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.identifier})
              </option>
            ))}
        </select>
      )}
    </div>
  );
};

// A two-state segmented control letting an editor flip the same embed between
// the link hub ('board') and the Gantt ('timeline'). Read-only viewers never
// see it — the mode is fixed by whoever inserted/last set the block.
const PlaneModeToggle = ({
  mode,
  onChange,
}: {
  mode: 'board' | 'timeline';
  onChange: (mode: 'board' | 'timeline') => void;
}) => (
  <div className="flex shrink-0 items-center gap-0.5 rounded border border-border/60 p-0.5">
    <button
      type="button"
      onClick={() => onChange('board')}
      aria-pressed={mode === 'board'}
      title="Show as a list"
      className={cn(
        'flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground',
        mode === 'board' && 'bg-accent text-foreground'
      )}
    >
      <List className="size-3.5" />
    </button>
    <button
      type="button"
      onClick={() => onChange('timeline')}
      aria-pressed={mode === 'timeline'}
      title="Show as a timeline"
      className={cn(
        'flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground',
        mode === 'timeline' && 'bg-accent text-foreground'
      )}
    >
      <GanttChartSquare className="size-3.5" />
    </button>
  </div>
);

// The read-only hub for a chosen project — its issues as a list ('board' mode)
// or a Gantt ('timeline' mode). Both share the same header, quick-links and
// the same `plane.project.board` query; only the body differs.
const PlaneEmbedHub = ({
  projectId,
  mode,
  editable,
  onModeChange,
}: {
  projectId: string;
  mode: 'board' | 'timeline';
  editable: boolean;
  onModeChange: (mode: 'board' | 'timeline') => void;
}) => {
  const workspace = useWorkspace();
  const { data, isLoading, isError, isFetching, refetch } = useQuery(
    { type: 'plane.project.board', userId: workspace.userId, projectId },
    { enabled: projectId.length > 0, staleTime: 30_000, retry: false }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Loading the Plane project&hellip;
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load the Plane project. Check that the integration is
          enabled.
        </p>
        <PlaneRetryButton
          onRetry={() => refetch()}
          busy={isFetching}
          label="Retry loading the Plane project"
        />
      </div>
    );
  }

  const board = data;
  const stateColorById = new Map(board.states.map((s) => [s.id, s.color]));
  const projectBase = board.projectUrl.replace(/issues\/?$/, '');

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
        <a
          href={board.projectUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            openInPlane(board.projectUrl);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-foreground no-underline hover:underline"
          title="Open the project in Plane"
        >
          <span className="truncate">{board.project.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {board.project.identifier}
          </span>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
        </a>
        {editable ? (
          <PlaneModeToggle mode={mode} onChange={onModeChange} />
        ) : null}
        <PlaneRetryButton
          onRetry={() => refetch()}
          busy={isFetching}
          label="Reload the Plane project"
          compact
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
        <PlaneQuickLink href={board.projectUrl} label="Issues" />
        <PlaneQuickLink href={`${projectBase}cycles/`} label="Cycles" />
        <PlaneQuickLink href={`${projectBase}modules/`} label="Modules" />
        <PlaneQuickLink href={`${projectBase}views/`} label="Views" />
        <PlaneQuickLink href={`${projectBase}pages/`} label="Pages" />
      </div>

      {mode === 'timeline' ? (
        <PlaneEmbedTimeline board={board} />
      ) : board.issues.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">
          No issues in this project.
        </div>
      ) : (
        <div
          className="flex flex-col divide-y divide-border/40 overflow-auto"
          style={{ maxHeight: MAX_HEIGHT }}
        >
          {board.issues.map((issue) => (
            <PlaneIssueLinkRow
              key={issue.id}
              issue={issue}
              color={
                (issue.stateId && stateColorById.get(issue.stateId)) ||
                '#94A3B8'
              }
            />
          ))}
        </div>
      )}

      {board.truncated ? (
        <a
          href={board.projectUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            openInPlane(board.projectUrl);
          }}
          className="block border-t border-border/60 px-3 py-1 text-[11px] text-muted-foreground no-underline hover:text-foreground hover:underline"
        >
          {board.issues.length} of {board.totalIssues} issues &mdash; see all
          issues in Plane
        </a>
      ) : null}
    </div>
  );
};

// One Gantt bar per issue that carries a usable start date. An issue with no
// startDate has no position on the axis and is dropped (same rule as the DB
// timeline); a missing/earlier targetDate collapses the issue to a milestone
// marker rather than inventing an end.
const buildIssueBars = (issues: PlaneBoardIssue[]): TimelineBar[] => {
  const bars: TimelineBar[] = [];
  for (const issue of issues) {
    const start = parseTimelineDate(issue.startDate);
    if (!start) {
      continue;
    }
    const rawEnd = parseTimelineDate(issue.targetDate);
    const end = rawEnd && rawEnd.getTime() >= start.getTime() ? rawEnd : null;
    bars.push({
      recordId: issue.id,
      start,
      end: end ?? start,
      isMilestone: end === null,
    });
  }
  return bars;
};

// The Gantt body for a project board, reusing the DB timeline's pure date
// maths (axis periods/bands + bar geometry) so it lines up pixel-for-pixel with
// the database timeline view. Read-only: every bar links out to Plane.
const PlaneEmbedTimeline = ({ board }: { board: PlaneProjectBoardOutput }) => {
  const stateColorById = useMemo(
    () => new Map(board.states.map((s) => [s.id, s.color])),
    [board.states]
  );

  const bars = useMemo(() => buildIssueBars(board.issues), [board.issues]);
  const issueById = useMemo(
    () => new Map(board.issues.map((issue) => [issue.id, issue])),
    [board.issues]
  );

  const today = useMemo(() => startOfUtcDay(new Date()), []);
  const range = useMemo(
    () => timelineRange(bars, EMBED_SCALE, today),
    [bars, today]
  );
  const periods = useMemo(
    () => buildTimelinePeriods(range, EMBED_SCALE),
    [range]
  );
  const bands = useMemo(() => buildTimelineBands(periods), [periods]);

  const pxPerDay = PX_PER_DAY[EMBED_SCALE];
  const chartWidth = (dayDiff(range.start, range.end) + 1) * pxPerDay;
  const todayOffset = dayDiff(range.start, today) * pxPerDay;
  const todayVisible = todayOffset >= 0 && todayOffset <= chartWidth;

  // Open scrolled to "now" so a project whose work started long ago doesn't
  // present as an empty grid next to a column of names.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const centredOn = useRef<string | null>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || chartWidth === 0) {
      return;
    }
    const key = `${range.start.toISOString()}:${chartWidth}`;
    if (centredOn.current === key) {
      return;
    }
    centredOn.current = key;
    scroller.scrollLeft = Math.max(0, todayOffset - scroller.clientWidth / 3);
  }, [chartWidth, todayOffset, range.start]);

  if (bars.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 px-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No issue in this project has a start date yet.
        </p>
        <p className="text-xs text-muted-foreground">
          Set an issue&apos;s start and target dates in Plane to place it on the
          timeline.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="w-full overflow-auto"
      style={{ maxHeight: MAX_HEIGHT }}
    >
      <div
        className="relative"
        style={{ width: NAME_WIDTH + chartWidth, minWidth: '100%' }}
      >
        <div className="sticky top-0 z-20 flex flex-row bg-background">
          <div
            className="sticky left-0 z-30 shrink-0 border-r border-b bg-background"
            style={{ width: NAME_WIDTH }}
          />
          <div className="shrink-0" style={{ width: chartWidth }}>
            <div className="flex flex-row border-b">
              {bands.map((band) => (
                <div
                  key={band.key}
                  className="shrink-0 truncate border-r px-1 py-0.5 text-xs font-medium text-muted-foreground"
                  style={{ width: band.days * pxPerDay }}
                >
                  {band.label}
                </div>
              ))}
            </div>
            <div className="flex flex-row border-b">
              {periods.map((period) => (
                <div
                  key={period.key}
                  className="shrink-0 truncate border-r px-1 py-0.5 text-center text-[10px] text-muted-foreground"
                  style={{ width: period.days * pxPerDay }}
                >
                  {period.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-0"
            style={{ left: NAME_WIDTH, width: chartWidth }}
          >
            {periods.map((period) => (
              <div
                key={period.key}
                className="absolute inset-y-0 border-r border-border/40"
                style={{
                  left: dayDiff(range.start, period.start) * pxPerDay,
                  width: period.days * pxPerDay,
                }}
              />
            ))}
            {todayVisible && (
              <div
                className="absolute inset-y-0 z-10 w-px bg-red-500"
                style={{ left: todayOffset }}
                title="Today"
              />
            )}
          </div>

          {bars.map((bar) => {
            const issue = issueById.get(bar.recordId);
            if (!issue) {
              return null;
            }
            const geometry = barGeometry(bar, range, EMBED_SCALE);
            const color =
              (issue.stateId && stateColorById.get(issue.stateId)) || '#94A3B8';
            const label = `${issue.key} — ${issue.name}`;
            const title = bar.isMilestone
              ? `${label} — ${formatDay(bar.start)}`
              : `${label} — ${formatDay(bar.start)} → ${formatDay(bar.end)}`;

            return (
              <div
                key={issue.id}
                className="group/plane-row flex flex-row border-b border-border/40"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r bg-background px-2 group-hover/plane-row:bg-accent"
                  style={{ width: NAME_WIDTH }}
                >
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {issue.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs" title={label}>
                    {issue.name}
                  </span>
                </div>
                <div className="relative shrink-0" style={{ width: chartWidth }}>
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      openInPlane(issue.url);
                    }}
                    title={title}
                    className={cn(
                      'absolute top-1/2 z-10 flex -translate-y-1/2 items-center',
                      'overflow-hidden rounded-md no-underline hover:brightness-110',
                      bar.isMilestone && 'rotate-45 rounded-sm ring-1 ring-background'
                    )}
                    style={{
                      left: geometry.left,
                      width: bar.isMilestone ? 12 : geometry.width,
                      height: bar.isMilestone ? 12 : 16,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const PlaneEmbedNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const projectId = (node.attrs.projectId as string | null) ?? '';
  const mode: 'board' | 'timeline' =
    node.attrs.mode === 'timeline' ? 'timeline' : 'board';
  const editable = editor.isEditable;

  if (!projectId) {
    if (!editable) {
      return (
        <NodeViewWrapper data-type="plane-embed">
          <div className="my-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            No Plane project selected
          </div>
        </NodeViewWrapper>
      );
    }
    return (
      <NodeViewWrapper data-type="plane-embed">
        <PlaneEmbedPicker updateAttributes={updateAttributes} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-type="plane-embed">
      <div
        contentEditable={false}
        className="my-2 select-none overflow-hidden rounded-md border border-border/60 bg-background"
      >
        <PlaneEmbedHub
          projectId={projectId}
          mode={mode}
          editable={editable}
          onModeChange={(next) => updateAttributes({ mode: next })}
        />
      </div>
    </NodeViewWrapper>
  );
};
