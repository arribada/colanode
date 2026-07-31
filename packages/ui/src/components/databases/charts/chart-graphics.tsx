// ABOUTME: Hand-rolled, dependency-free inline SVG renderers (pie / bar / line)
// ABOUTME: for the database chart view. CSP-safe — no external chart library.
import { ChartBucket } from '@colanode/ui/components/databases/charts/chart-aggregation';

interface ChartGraphicProps {
  buckets: ChartBucket[];
  formatValue: (value: number) => string;
}

const polarToCartesian = (
  cx: number,
  cy: number,
  radius: number,
  angle: number
) => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
};

export const PieChartGraphic = ({
  buckets,
  formatValue,
}: ChartGraphicProps) => {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;

  if (total <= 0) {
    return <EmptyGraphic />;
  }

  let cursor = 0;
  const slices = buckets
    .filter((bucket) => bucket.value > 0)
    .map((bucket) => {
      const startAngle = (cursor / total) * 360;
      cursor += bucket.value;
      const endAngle = (cursor / total) * 360;
      const largeArc = endAngle - startAngle > 180 ? 1 : 0;

      // A single non-zero slice covering the whole circle can't be drawn as an
      // arc (start == end); fall back to a full circle.
      if (endAngle - startAngle >= 359.999) {
        return (
          <circle
            key={bucket.key}
            cx={cx}
            cy={cy}
            r={radius}
            fill={bucket.color}
          />
        );
      }

      const start = polarToCartesian(cx, cy, radius, startAngle);
      const end = polarToCartesian(cx, cy, radius, endAngle);
      const d = [
        `M ${cx} ${cy}`,
        `L ${start.x} ${start.y}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
        'Z',
      ].join(' ');

      return <path key={bucket.key} d={d} fill={bucket.color} />;
    });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-64 w-64 max-w-full shrink-0"
      role="img"
    >
      {slices}
      <circle cx={cx} cy={cy} r={radius * 0.55} className="fill-background" />
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-foreground"
        fontSize={22}
        fontWeight={600}
      >
        {formatValue(total)}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={11}
      >
        Total
      </text>
    </svg>
  );
};

export const BarChartGraphic = ({
  buckets,
  formatValue,
}: ChartGraphicProps) => {
  const width = 480;
  const height = 260;
  const paddingLeft = 44;
  const paddingBottom = 48;
  const paddingTop = 12;
  const plotWidth = width - paddingLeft - 12;
  const plotHeight = height - paddingBottom - paddingTop;
  const maxValue = Math.max(...buckets.map((b) => b.value), 0);

  if (buckets.length === 0 || maxValue <= 0) {
    return <EmptyGraphic />;
  }

  const slotWidth = plotWidth / buckets.length;
  const barWidth = Math.min(slotWidth * 0.6, 60);
  const ticks = buildTicks(maxValue, 4);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-64 w-full max-w-2xl"
      role="img"
    >
      {ticks.map((tick) => {
        const y = paddingTop + plotHeight - (tick / maxValue) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={paddingLeft}
              y1={y}
              x2={width - 12}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.12}
            />
            <text
              x={paddingLeft - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={10}
            >
              {formatValue(tick)}
            </text>
          </g>
        );
      })}
      {buckets.map((bucket, index) => {
        const barHeight = (bucket.value / maxValue) * plotHeight;
        const x = paddingLeft + index * slotWidth + (slotWidth - barWidth) / 2;
        const y = paddingTop + plotHeight - barHeight;
        return (
          <g key={bucket.key}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 0)}
              rx={3}
              fill={bucket.color}
            />
            <text
              x={x + barWidth / 2}
              y={y - 4}
              textAnchor="middle"
              className="fill-foreground"
              fontSize={10}
            >
              {formatValue(bucket.value)}
            </text>
            <text
              x={x + barWidth / 2}
              y={height - paddingBottom + 16}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={10}
            >
              {truncate(bucket.label, 10)}
            </text>
          </g>
        );
      })}
      <line
        x1={paddingLeft}
        y1={paddingTop + plotHeight}
        x2={width - 12}
        y2={paddingTop + plotHeight}
        stroke="currentColor"
        strokeOpacity={0.3}
      />
    </svg>
  );
};

export const LineChartGraphic = ({
  buckets,
  formatValue,
}: ChartGraphicProps) => {
  const width = 480;
  const height = 260;
  const paddingLeft = 44;
  const paddingBottom = 48;
  const paddingTop = 12;
  const plotWidth = width - paddingLeft - 12;
  const plotHeight = height - paddingBottom - paddingTop;
  const maxValue = Math.max(...buckets.map((b) => b.value), 0);

  if (buckets.length === 0 || maxValue <= 0) {
    return <EmptyGraphic />;
  }

  const stepX = buckets.length > 1 ? plotWidth / (buckets.length - 1) : 0;
  const points = buckets.map((bucket, index) => {
    const x =
      buckets.length > 1
        ? paddingLeft + index * stepX
        : paddingLeft + plotWidth / 2;
    const y = paddingTop + plotHeight - (bucket.value / maxValue) * plotHeight;
    return { x, y, bucket };
  });

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const ticks = buildTicks(maxValue, 4);
  const strokeColor = buckets[0]?.color ?? '#3b82f6';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-64 w-full max-w-2xl"
      role="img"
    >
      {ticks.map((tick) => {
        const y = paddingTop + plotHeight - (tick / maxValue) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={paddingLeft}
              y1={y}
              x2={width - 12}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.12}
            />
            <text
              x={paddingLeft - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={10}
            >
              {formatValue(tick)}
            </text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={2} />
      {points.map((point) => (
        <g key={point.bucket.key}>
          <circle cx={point.x} cy={point.y} r={3.5} fill={strokeColor} />
          <text
            x={point.x}
            y={height - paddingBottom + 16}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={10}
          >
            {truncate(point.bucket.label, 10)}
          </text>
        </g>
      ))}
      <line
        x1={paddingLeft}
        y1={paddingTop + plotHeight}
        x2={width - 12}
        y2={paddingTop + plotHeight}
        stroke="currentColor"
        strokeOpacity={0.3}
      />
    </svg>
  );
};

const EmptyGraphic = () => (
  <div className="flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
    <p>No data to chart</p>
  </div>
);

const buildTicks = (maxValue: number, count: number): number[] => {
  if (maxValue <= 0) {
    return [0];
  }
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push((maxValue / count) * i);
  }
  return ticks;
};

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
};
