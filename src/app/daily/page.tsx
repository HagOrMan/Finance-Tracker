"use client";

import { useMemo } from "react";

import { FilterBar } from "@/components/filter-bar";
import { StackedCategoryBarChart } from "@/components/charts/stacked-category-bar-chart";
import { ReceiptsTable } from "@/components/receipts-table";
import { Separator } from "@/components/ui/separator";
import { useFilteredReceipts } from "@/hooks/use-filtered-receipts";

export default function DailyPage() {
  const { receipts, isLoading, error, plabel, colorMap, pcol } = useFilteredReceipts();

  const categories = useMemo(
    () => [...new Set(receipts.map((r) => r.category))].sort(),
    [receipts]
  );

  const chartData = useMemo(() => {
    const byDay = new Map<string, Record<string, string | number>>();
    for (const r of receipts) {
      const row = byDay.get(r.date) ?? { bucket: r.date };
      row[r.category] = (Number(row[r.category]) || 0) + r[pcol];
      byDay.set(r.date, row);
    }
    return [...byDay.values()].sort((a, b) =>
      String(a.bucket) < String(b.bucket) ? -1 : 1
    );
  }, [receipts, pcol]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">📅 Daily Breakdown</h1>

      <FilterBar />

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !error && receipts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No receipts match the current filters.
        </p>
      )}

      {!isLoading && receipts.length > 0 && (
        <>
          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Spend by day and category
            </h2>
            <StackedCategoryBarChart
              data={chartData}
              categories={categories}
              colorMap={colorMap}
              height={340}
            />
          </div>

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">Receipts</h2>
            <ReceiptsTable
              receipts={receipts}
              priceKey={pcol}
              priceLabel={plabel}
              showDiscountColumns
            />
          </div>
        </>
      )}
    </div>
  );
}
