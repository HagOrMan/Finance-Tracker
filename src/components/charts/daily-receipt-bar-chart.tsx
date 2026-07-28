"use client";

import { useMemo } from "react";
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

import { LEGEND_STYLE } from "@/components/charts/legend-style";
import type { MergedReceipt } from "@/lib/data/types";
import { formatCurrency } from "@/lib/format";

/**
 * Spend per day, **one stacked segment per receipt**, coloured by category.
 *
 * Not `StackedCategoryBarChart`, which sums a day's same-category receipts into
 * one segment and is still the right chart for `/monthly` — 200 segments in a
 * month bar would be noise. Here the individual receipt is the point.
 *
 * **How the per-receipt stacking works.** Recharts stacks by `dataKey`, one
 * series per key, so a segment per receipt needs a key per receipt-slot. Rather
 * than one key per position in the stack — which would need a different fill
 * per datum within the same series, and therefore a `shape` render prop — the
 * keys are `(category, nth occurrence of that category that day)`. Every series
 * then holds exactly one category, so its fill is a constant and Recharts needs
 * no custom rendering at all. Declaring them grouped by category also makes
 * same-category segments stack adjacently, so a day reads as category blocks
 * with visible divisions rather than a scramble.
 *
 * Series count is the sum over categories of that category's busiest single
 * day — a few dozen at most, not one per receipt in the range.
 *
 * Keys are `k<categoryIndex>_<n>`, never the category name itself: Recharts
 * resolves `dataKey` as a lodash-style path, so a free-text category containing
 * a `.` or `[` would silently resolve to nothing.
 */

interface Segment {
  id: number;
  store: string;
  category: string;
  note: string | null;
  value: number;
}

interface DayRow {
  bucket: string;
  total: number;
  segments: Segment[];
  /** `k<categoryIndex>_<n>` → amount. */
  [slotKey: string]: string | number | Segment[];
}

/** Cap the tooltip's row list; a 30-receipt day would otherwise run off-screen. */
const MAX_TOOLTIP_ROWS = 10;

export function DailyReceiptBarChart({
  receipts,
  priceKey,
  colorMap,
  height = 340,
}: {
  receipts: MergedReceipt[];
  priceKey: "actual_price" | "price";
  colorMap: Record<string, string>;
  height?: number;
}) {
  const { data, series } = useMemo(() => {
    const categories = [...new Set(receipts.map((r) => r.category))].sort();
    const categoryIndex = new Map(categories.map((c, i) => [c, i]));

    const byDay = new Map<string, Segment[]>();
    for (const r of receipts) {
      const value = r[priceKey];
      // A fully-refunded receipt is a genuine $0 of net spend, and a negative
      // segment would break the stack's geometry. It stays in the table below.
      if (value <= 0) continue;
      const list = byDay.get(r.date) ?? [];
      list.push({
        id: r.id,
        store: r.store,
        category: r.category,
        note: r.note,
        value,
      });
      byDay.set(r.date, list);
    }

    // How many times the busiest day used each category — that's how many
    // series that category needs.
    const slotsPerCategory = new Map<string, number>();
    const rows: DayRow[] = [];

    for (const [bucket, segments] of [...byDay.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      segments.sort(
        (a, b) => a.category.localeCompare(b.category) || b.value - a.value,
      );

      const seenInDay = new Map<string, number>();
      const row: DayRow = { bucket, total: 0, segments };
      for (const segment of segments) {
        const n = seenInDay.get(segment.category) ?? 0;
        seenInDay.set(segment.category, n + 1);
        slotsPerCategory.set(
          segment.category,
          Math.max(slotsPerCategory.get(segment.category) ?? 0, n + 1),
        );
        row[`k${categoryIndex.get(segment.category)}_${n}`] = segment.value;
        row.total += segment.value;
      }
      rows.push(row);
    }

    const series = categories.flatMap((category) =>
      Array.from(
        { length: slotsPerCategory.get(category) ?? 0 },
        (_, n) => ({
          key: `k${categoryIndex.get(category)}_${n}`,
          category,
        }),
      ),
    );

    return { data: rows, series };
  }, [receipts, priceKey]);

  // One legend entry per category, not per series — the whole reason the series
  // are keyed by slot is that nobody wants to read "Groceries" four times.
  //
  // Rendered through `content` rather than `payload`: Recharts 3 `Omit`s
  // `payload` from Legend's props, so overriding the auto-derived list (which
  // would hold one entry per series) has to be done by supplying the renderer.
  const legendCategories = useMemo(
    () => [...new Set(series.map((s) => s.category))],
    [series],
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
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
        <Tooltip
          cursor={{ fill: "var(--color-accent)" }}
          content={<DailyReceiptTooltip colorMap={colorMap} />}
        />
        <Legend
          wrapperStyle={LEGEND_STYLE}
          content={
            <CategoryLegend categories={legendCategories} colorMap={colorMap} />
          }
        />
        {series.map(({ key, category }) => (
          <Bar
            key={key}
            dataKey={key}
            name={category}
            stackId="stack"
            fill={colorMap[category] ?? "#888"}
            // The hairline is what makes two same-category receipts read as two
            // receipts rather than one taller block.
            stroke="var(--color-background)"
            strokeWidth={0.5}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * The legend Recharts would have derived, collapsed to one row per category.
 *
 * Recharts clones this element with the auto-derived legend props; they are
 * deliberately ignored, since that payload holds one entry per *series* and the
 * series are per-slot. Matches the default legend's look so it doesn't read as
 * a different control from the ones on every other chart.
 */
function CategoryLegend({
  categories,
  colorMap,
}: {
  categories: string[];
  colorMap: Record<string, string>;
}) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {categories.map((category) => (
        <li key={category} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-xs"
            style={{ backgroundColor: colorMap[category] ?? "#888" }}
          />
          <span className="text-muted-foreground">{category}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lists the day's receipts rather than the hovered segment alone.
 *
 * Recharts drives bar tooltips off the x-axis category, so it knows which
 * *day* is hovered but not which segment within the stack. Listing the day is
 * the honest rendering of what it actually knows — and it happens to answer the
 * question better, since "what did I buy on the 25th" is usually why you're
 * hovering.
 */
function DailyReceiptTooltip({
  active,
  payload,
  label,
  colorMap,
}: {
  active?: boolean;
  payload?: { payload?: DayRow }[];
  label?: string;
  colorMap: Record<string, string>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const shown = row.segments.slice(0, MAX_TOOLTIP_ROWS);
  const hidden = row.segments.length - shown.length;

  return (
    <div className="max-w-80 rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <div className="mb-1 flex items-baseline justify-between gap-3 font-medium">
        <span>{label}</span>
        <span className="tabular-nums">{formatCurrency(row.total)}</span>
      </div>
      <div className="flex flex-col gap-1">
        {shown.map((segment) => (
          <div key={segment.id} className="flex items-start gap-2">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: colorMap[segment.category] ?? "#888",
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate">{segment.store}</span>
                <span className="ml-auto shrink-0 tabular-nums">
                  {formatCurrency(segment.value)}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {segment.category}
                {segment.note ? ` · ${segment.note}` : ""}
              </div>
            </div>
          </div>
        ))}
        {hidden > 0 && (
          <div className="text-xs text-muted-foreground">
            + {hidden} more receipt{hidden === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}
