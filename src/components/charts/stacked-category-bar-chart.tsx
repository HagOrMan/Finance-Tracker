"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";

export function StackedCategoryBarChart({
  data,
  categories,
  colorMap,
  height = 320,
}: {
  data: Record<string, string | number>[];
  categories: string[];
  colorMap: Record<string, string>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="bucket"
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
        <Tooltip cursor={{ fill: "var(--color-accent)" }} content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {categories.map((cat) => (
          <Bar
            key={cat}
            dataKey={cat}
            name={cat}
            stackId="stack"
            fill={colorMap[cat] ?? "#888"}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
