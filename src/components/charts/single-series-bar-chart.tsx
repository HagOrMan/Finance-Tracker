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

export function SingleSeriesBarChart({
  data,
  color,
  colorMap,
  seriesName,
  height = 280,
}: {
  data: SingleSeriesDatum[];
  /** Flat fill for every bar. Ignored if `colorMap` is given. */
  color?: string;
  /** Per-bar fill, keyed by each datum's `x` — e.g. the category color map. */
  colorMap?: Record<string, string>;
  seriesName: string;
  height?: number;
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
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="x"
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
        />
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
