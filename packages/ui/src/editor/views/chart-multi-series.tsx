// ABOUTME: Multi-series SVG chart for the chart block — grouped or stacked bars,
// ABOUTME: lines, areas and a pie, with a legend and a hover tooltip. No library.
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  formatChartValue,
  niceTicks,
  type TableChartData,
  type TableChartSeries,
  type TableChartType,
  valueDomain,
} from '@colanode/ui/editor/views/chart-table';

// Categorical slots, defined light and dark in styles/editor.css (.viz-palette).
// A series keeps its slot, so its colour follows it, never its rank.
export const seriesColor = (series: { slot: number; color: string | null }) =>
  series.color || `var(--viz-${(series.slot % 8) + 1})`;

const HEIGHT = 300;
const PAD_TOP = 14;
const PAD_RIGHT = 16;
const PAD_BOTTOM = 34;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

interface MultiSeriesChartProps {
  data: TableChartData;
  chartType: TableChartType;
  fromZero: boolean;
  title?: string;
}

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) {
        setWidth(Math.round(next));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

// A bar with 4px rounded data-end and a square base, growing up or down.
const barPath = (x: number, w: number, from: number, to: number): string => {
  const height = Math.abs(to - from);
  if (height < 0.5 || w <= 0) {
    return '';
  }
  const r = Math.min(RADIUS, w / 2, height);
  if (to <= from) {
    // grows upward: rounded top at `to`
    return `M${x},${from}V${to + r}Q${x},${to} ${x + r},${to}H${x + w - r}Q${x + w},${to} ${x + w},${to + r}V${from}Z`;
  }
  return `M${x},${from}V${to - r}Q${x},${to} ${x + r},${to}H${x + w - r}Q${x + w},${to} ${x + w},${to - r}V${from}Z`;
};

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export const MultiSeriesChart = ({
  data,
  chartType,
  fromZero,
  title,
}: MultiSeriesChartProps) => {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const plotted = data.series.filter((s) => s.values.some((v) => v !== null));
  const empty = data.categories.length === 0 || plotted.length === 0;

  if (chartType === 'pie') {
    return (
      <div ref={ref} className="viz-palette w-full">
        {empty ? <Empty /> : <PieChart data={data} title={title} />}
      </div>
    );
  }

  return (
    <div ref={ref} className="viz-palette relative w-full">
      {empty ? (
        <Empty />
      ) : (
        <CartesianChart
          data={{ ...data, series: plotted }}
          chartType={chartType}
          fromZero={fromZero}
          width={width}
          hover={hover}
          onHover={setHover}
          title={title}
        />
      )}
      {!empty && plotted.length >= 2 && (
        <Legend
          items={plotted.map((s) => ({
            key: s.key,
            name: s.name,
            color: seriesColor(s),
          }))}
          line={chartType === 'line'}
        />
      )}
    </div>
  );
};

interface CartesianChartProps {
  data: TableChartData;
  chartType: Exclude<TableChartType, 'pie'>;
  fromZero: boolean;
  width: number;
  hover: number | null;
  onHover: (index: number | null) => void;
  title?: string;
}

const CartesianChart = ({
  data,
  chartType,
  fromZero,
  width,
  hover,
  onHover,
  title,
}: CartesianChartProps) => {
  const { categories, series, style } = data;
  const [rawMin, rawMax] = valueDomain(data, chartType, fromZero);
  const ticks = useMemo(() => niceTicks(rawMin, rawMax), [rawMin, rawMax]);
  const min = ticks[0] ?? rawMin;
  const max = ticks[ticks.length - 1] ?? rawMax;

  const tickLabels = ticks.map((tick) => formatChartValue(tick, style));
  const padLeft =
    Math.max(...tickLabels.map((label) => label.length)) * 6.4 + 14;
  const plotWidth = Math.max(40, width - padLeft - PAD_RIGHT);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const y = (value: number) =>
    PAD_TOP + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
  const baseline = y(Math.min(Math.max(0, min), max));

  const count = categories.length;
  const band = plotWidth / count;
  // Lines and areas put points on band centres too, so the hover band, the
  // label and the point always line up.
  const cx = (i: number) => padLeft + band * i + band / 2;

  const labelEvery = Math.max(
    1,
    Math.ceil(count / Math.max(1, Math.floor(plotWidth / 64)))
  );
  const labelChars = Math.max(4, Math.floor((band * labelEvery) / 6.5));

  const marks = (() => {
    if (chartType === 'bar') {
      const n = series.length;
      const barWidth = Math.max(
        2,
        Math.min(BAR_MAX, (band * 0.8 - GAP * (n - 1)) / n)
      );
      const group = barWidth * n + GAP * (n - 1);
      return series.map((s) => (
        <g key={s.key} fill={seriesColor(s)}>
          {s.values.map((value, i) => {
            if (value === null) return null;
            const position = series.indexOf(s);
            const x = cx(i) - group / 2 + position * (barWidth + GAP);
            return (
              <path key={i} d={barPath(x, barWidth, baseline, y(value))} />
            );
          })}
        </g>
      ));
    }

    if (chartType === 'stacked') {
      const barWidth = Math.max(2, Math.min(BAR_MAX * 1.5, band * 0.6));
      const up = new Array<number>(count).fill(0);
      const down = new Array<number>(count).fill(0);
      // The outermost segment on each side carries the rounded data-end.
      const lastUp = new Array<number>(count).fill(-1);
      const lastDown = new Array<number>(count).fill(-1);
      series.forEach((s, si) =>
        s.values.forEach((value, i) => {
          if (value === null || value === 0) return;
          if (value > 0) lastUp[i] = si;
          else lastDown[i] = si;
        })
      );
      return series.map((s, si) => (
        <g key={s.key} fill={seriesColor(s)}>
          {s.values.map((value, i) => {
            if (value === null || value === 0) return null;
            const stack = value > 0 ? up : down;
            const start = stack[i] ?? 0;
            const end = start + value;
            stack[i] = end;
            const x = cx(i) - barWidth / 2;
            const from = y(start);
            const to = y(end);
            const outer = (value > 0 ? lastUp[i] : lastDown[i]) === si;
            // The 2px surface gap sits between segments, taken off the far end.
            const inner = value > 0 ? to + GAP : to - GAP;
            if (outer) {
              return <path key={i} d={barPath(x, barWidth, from, to)} />;
            }
            const top = Math.min(from, inner);
            const height = Math.abs(inner - from);
            return height > 0.5 ? (
              <rect key={i} x={x} y={top} width={barWidth} height={height} />
            ) : null;
          })}
        </g>
      ));
    }

    // line / area
    return series.map((s) => {
      const color = seriesColor(s);
      type Point = { i: number; x: number; y: number };
      const segments: Point[][] = [];
      let current: Point[] = [];
      s.values.forEach((value, i) => {
        if (value === null) {
          if (current.length) segments.push(current);
          current = [];
          return;
        }
        current.push({ i, x: cx(i), y: y(value) });
      });
      if (current.length) segments.push(current);
      // Past 40 points the dots crowd the line: only the hovered one shows.
      const showDots = count <= 40;
      return (
        <g key={s.key}>
          {chartType === 'area' &&
            segments.map((points, k) => {
              const first = points[0];
              const last = points[points.length - 1];
              return first && last && points.length > 1 ? (
                <path
                  key={`a${k}`}
                  d={`M${first.x},${baseline}${points.map((p) => `L${p.x},${p.y}`).join('')}L${last.x},${baseline}Z`}
                  fill={color}
                  fillOpacity={0.1}
                />
              ) : null;
            })}
          {segments.map((points, k) => (
            <path
              key={`l${k}`}
              d={points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join('')}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {segments
            .flat()
            .map((p) =>
              showDots || hover === p.i ? (
                <circle
                  key={`d${p.i}`}
                  cx={p.x}
                  cy={p.y}
                  r={hover === p.i ? 5 : 4}
                  fill={color}
                  strokeWidth={2}
                  className="stroke-background"
                />
              ) : null
            )}
        </g>
      );
    });
  })();

  const tooltipLeft = hover === null ? 0 : cx(hover);

  return (
    <div className="relative" onMouseLeave={() => onHover(null)}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={title || `Chart of ${series.map((s) => s.name).join(', ')}`}
        className="block max-w-full overflow-visible"
      >
        {ticks.map((tick, i) => (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={width - PAD_RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.35 : 0.1}
              shapeRendering="crispEdges"
            />
            <text
              x={padLeft - 8}
              y={y(tick) + 3.5}
              textAnchor="end"
              fontSize={11}
              className="fill-muted-foreground"
            >
              {tickLabels[i]}
            </text>
          </g>
        ))}

        {hover !== null && (chartType === 'bar' || chartType === 'stacked') && (
          <rect
            x={padLeft + band * hover}
            y={PAD_TOP}
            width={band}
            height={plotHeight}
            fill="currentColor"
            fillOpacity={0.05}
          />
        )}
        {hover !== null && (chartType === 'line' || chartType === 'area') && (
          <line
            x1={tooltipLeft}
            x2={tooltipLeft}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="currentColor"
            strokeOpacity={0.25}
          />
        )}

        {marks}

        {categories.map((label, i) =>
          i % labelEvery === 0 ? (
            <text
              key={i}
              x={cx(i)}
              y={HEIGHT - PAD_BOTTOM + 18}
              textAnchor="middle"
              fontSize={11}
              className="fill-muted-foreground"
            >
              {truncate(label, labelChars)}
            </text>
          ) : null
        )}

        {categories.map((_, i) => (
          <rect
            key={i}
            x={padLeft + band * i}
            y={PAD_TOP}
            width={band}
            height={plotHeight + PAD_BOTTOM}
            fill="transparent"
            onMouseEnter={() => onHover(i)}
            onMouseMove={() => onHover(i)}
          />
        ))}
      </svg>

      {hover !== null && (
        <Tooltip
          left={tooltipLeft}
          width={width}
          title={categories[hover] ?? ''}
          rows={series.map((s) => ({
            key: s.key,
            name: s.name,
            color: seriesColor(s),
            value: s.values[hover] ?? null,
            series: s,
          }))}
          total={
            chartType === 'stacked' && series.length > 1
              ? formatChartValue(
                  series.reduce((sum, s) => sum + (s.values[hover] ?? 0), 0),
                  style
                )
              : null
          }
        />
      )}
    </div>
  );
};

interface TooltipRow {
  key: string;
  name: string;
  color: string;
  value: number | null;
  series: TableChartSeries;
}

const Tooltip = ({
  left,
  width,
  title,
  rows,
  total,
}: {
  left: number;
  width: number;
  title: string;
  rows: TooltipRow[];
  total: string | null;
}) => {
  // Keep the box inside the chart: flip to the left half past the middle.
  const onRight = left < width / 2;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      style={
        onRight
          ? { left: Math.min(left + 12, width - 150) }
          : { right: Math.max(width - left + 12, 0) }
      }
    >
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2 py-0.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: row.color }}
          />
          <span className="flex-1 text-muted-foreground">{row.name}</span>
          <span className="tabular-nums">
            {row.value === null
              ? '—'
              : formatChartValue(row.value, row.series.style)}
          </span>
        </div>
      ))}
      {total && (
        <div className="mt-1 flex justify-between border-t pt-1">
          <span className="text-muted-foreground">Total</span>
          <span className="tabular-nums">{total}</span>
        </div>
      )}
    </div>
  );
};

const Legend = ({
  items,
  line,
}: {
  items: { key: string; name: string; color: string; detail?: string }[];
  line: boolean;
}) => (
  <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
    {items.map((item) => (
      <span key={item.key} className="flex items-center gap-1.5">
        <span
          className={line ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-sm'}
          style={{ background: item.color }}
        />
        <span className="text-foreground">{item.name}</span>
        {item.detail && <span className="tabular-nums">{item.detail}</span>}
      </span>
    ))}
  </div>
);

// A pie shows one series (the first) split across the categories.
const PieChart = ({
  data,
  title,
}: {
  data: TableChartData;
  title?: string;
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const series = data.series.find((s) => s.values.some((v) => v !== null));
  if (!series) {
    return <Empty />;
  }
  const slices = data.categories
    .map((label, i) => ({ label, i, value: series.values[i] ?? 0 }))
    .filter((slice) => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return <Empty message="A pie needs positive values" />;
  }

  const size = 220;
  const c = size / 2;
  const r = c - 4;
  let angle = -Math.PI / 2;
  const paths = slices.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    const color = `var(--viz-${(slice.i % 8) + 1})`;
    if (sweep >= Math.PI * 2 - 1e-6) {
      return { slice, color, d: null };
    }
    const x1 = c + r * Math.cos(start);
    const y1 = c + r * Math.sin(start);
    const x2 = c + r * Math.cos(angle);
    const y2 = c + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return {
      slice,
      color,
      d: `M${c},${c}L${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}Z`,
    };
  });
  const hovered = hover === null ? null : slices.find((s) => s.i === hover);

  return (
    <div className="flex flex-col items-center">
      {series.name && (
        <p className="mb-1 text-xs text-muted-foreground">{series.name}</p>
      )}
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={title || `${series.name} by ${data.categories.join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        {paths.map(({ slice, color, d }) =>
          d === null ? (
            <circle key={slice.i} cx={c} cy={c} r={r} fill={color} />
          ) : (
            <path
              key={slice.i}
              d={d}
              fill={color}
              strokeWidth={2}
              className="stroke-background"
              opacity={hover === null || hover === slice.i ? 1 : 0.55}
              onMouseEnter={() => setHover(slice.i)}
            />
          )
        )}
        <circle cx={c} cy={c} r={r * 0.55} className="fill-background" />
        <text
          x={c}
          y={c - 2}
          textAnchor="middle"
          fontSize={18}
          fontWeight={600}
          className="fill-foreground"
        >
          {formatChartValue(hovered ? hovered.value : total, series.style)}
        </text>
        <text
          x={c}
          y={c + 16}
          textAnchor="middle"
          fontSize={11}
          className="fill-muted-foreground"
        >
          {hovered
            ? `${truncate(hovered.label, 16)} · ${Math.round((hovered.value / total) * 100)} %`
            : 'Total'}
        </text>
      </svg>
      <Legend
        line={false}
        items={slices.map((slice) => ({
          key: String(slice.i),
          name: slice.label,
          color: `var(--viz-${(slice.i % 8) + 1})`,
          detail: `${Math.round((slice.value / total) * 100)} %`,
        }))}
      />
    </div>
  );
};

const Empty = ({
  message = 'No numbers to chart yet',
}: {
  message?: string;
}) => (
  <div className="flex h-40 w-full items-center justify-center text-sm text-muted-foreground">
    {message}
  </div>
);
