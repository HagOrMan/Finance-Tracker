"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";

export interface SingleSeriesDatum {
  x: string;
  y: number;
}

/** Beyond this, an angled label starts colliding with the next bar's. */
const LABEL_MAX_CHARS = 18;

/**
 * The angled, truncated tick used when `longLabels` is set.
 *
 * Recharts' default is to *drop* ticks that would overlap, which for a
 * category axis silently hides whole bars' names — the bar is drawn, the label
 * next to it belongs to a different bar. Rotating and truncating shows all of
 * them; the full text stays reachable through the SVG `<title>` and the
 * tooltip.
 */
// Only the three props this reads, typed as loosely as Recharts declares them:
// its tick props carry `x`/`y` as `string | number` (SVG coordinates, which may
// arrive as strings) and a `payload` whose `value` is untyped. Narrowing either
// makes the whole tick-props object unassignable.
function AngledTick({
  x,
  y,
  payload,
}: {
  x?: string | number;
  y?: string | number;
  payload?: { value?: unknown };
}) {
  const full = String(payload?.value ?? "");
  const shown =
    full.length > LABEL_MAX_CHARS ? `${full.slice(0, LABEL_MAX_CHARS - 1)}…` : full;
  return (
    // Rotation is on the <text>, about the translated origin — so `dy` is the
    // gap below the axis line and the label swings out from there.
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        dy={14}
        textAnchor="end"
        transform="rotate(-30)"
        fontSize={12}
        fill="var(--color-muted-foreground)"
      >
        <title>{full}</title>
        {shown}
      </text>
    </g>
  );
}

export function SingleSeriesBarChart({
  data,
  color,
  colorMap,
  seriesName,
  height = 280,
  longLabels = false,
}: {
  data: SingleSeriesDatum[];
  /** Flat fill for every bar. Ignored if `colorMap` is given. */
  color?: string;
  /** Per-bar fill, keyed by each datum's `x` — e.g. the category color map. */
  colorMap?: Record<string, string>;
  seriesName: string;
  height?: number;
  /**
   * Angle and truncate the x labels, and show every one of them.
   *
   * For category/entity axes, where names run long and Recharts' overlap
   * handling hides them. Leave off for date axes — there the auto-hiding is
   * what keeps a 90-day range readable.
   */
  longLabels?: boolean;
}) {
  // Recharts 3 deprecated <Cell> (removed in 4.0); a per-datum `fill` on the
  // chart data is the supported way to colour individual bars. Bars fall back
  // to the <Bar fill> below when no `colorMap` is supplied.
  const chartData = useMemo(
    () =>
      colorMap
        ? data.map((d) => ({ ...d, fill: colorMap[d.x] ?? "#888" }))
        : data,
    [data, colorMap],
  );

  return (
    // The angled labels need somewhere to go: extra chart height plus a bottom
    // margin, rather than letting them run off the container and clip.
    <ResponsiveContainer width="100%" height={longLabels ? height + 60 : height}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 8, left: 8, bottom: longLabels ? 68 : 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        {/* Two whole elements rather than one with ternary props: the plain
            axis must not pass `interval` at all, so Recharts keeps its own
            default ("preserveEnd") rather than having it pinned here. */}
        {longLabels ? (
          <XAxis
            dataKey="x"
            tick={(props) => <AngledTick {...props} />}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
        ) : (
          <XAxis
            dataKey="x"
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
        )}
        <YAxis
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--color-accent)" }}
          content={<ChartTooltip />}
        />
        <Bar
          dataKey="y"
          name={seriesName}
          fill={color ?? "#888"}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
