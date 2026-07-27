"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatCurrency } from "@/lib/format";

export interface PieDatum {
  category: string;
  value: number;
}

export function CategoryPieChart({
  data,
  colorMap,
  height = 360,
}: {
  data: PieDatum[];
  colorMap: Record<string, string>;
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="category"
          innerRadius="45%"
          outerRadius="80%"
          paddingAngle={1}
        >
          {data.map((d) => (
            <Cell key={d.category} fill={colorMap[d.category] ?? "#888"} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload as PieDatum | undefined;
            if (!d) return null;
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                <div className="font-medium">{d.category}</div>
                <div className="text-muted-foreground">
                  {formatCurrency(d.value)} · {pct.toFixed(1)}%
                </div>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
