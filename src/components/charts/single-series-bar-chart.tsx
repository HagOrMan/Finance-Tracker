"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
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
        <Bar dataKey="y" name={seriesName} fill={color ?? "#888"} radius={[4, 4, 0, 0]}>
          {colorMap &&
            data.map((d) => <Cell key={d.x} fill={colorMap[d.x] ?? "#888"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
