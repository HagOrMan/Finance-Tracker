"use client";

import { useMemo } from "react";

import { FilterBar } from "@/components/filter-bar";
import { DailyReceiptBarChart } from "@/components/charts/daily-receipt-bar-chart";
import { StatCard } from "@/components/charts/stat-card";
import { ReceiptsTable } from "@/components/receipts-table";
import { Separator } from "@/components/ui/separator";
import { useFilteredReceipts } from "@/hooks/use-filtered-receipts";
import { formatCurrency } from "@/lib/format";

export default function DailyPage() {
  const { receipts, isLoading, error, plabel, colorMap, pcol } =
    useFilteredReceipts();

  // Every receipt the filters matched, including the fully-refunded ones the
  // chart drops as zero-height segments — the figure has to agree with the
  // table below it, which lists them.
  const totalSpend = receipts.reduce((sum, r) => sum + r[pcol], 0);
  // Per *receipt*, not per day: the overview already answers per-day, and this
  // page is where a single category gets scoped down, where "the average gift
  // costs this much" is the question. Divides by receipts, so an empty range
  // never reaches it — the whole block is behind `receipts.length > 0`.
  const avgPerReceipt = receipts.length > 0 ? totalSpend / receipts.length : 0;

  // The peak the chart is already showing, named. Ties go to the earlier date
  // (strict `>`), which at least makes it deterministic.
  const biggestDay = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of receipts) {
      byDay.set(r.date, (byDay.get(r.date) ?? 0) + r[pcol]);
    }
    let peak: { date: string; total: number } | null = null;
    for (const [date, total] of byDay) {
      if (!peak || total > peak.total) peak = { date, total };
    }
    return peak;
  }, [receipts, pcol]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">
        📅 Daily Breakdown
      </h1>

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label={`Total (${plabel})`}
              value={formatCurrency(totalSpend)}
            />
            <StatCard label="Receipts" value={receipts.length} />
            <StatCard
              label="Avg / receipt"
              value={formatCurrency(avgPerReceipt)}
            />
            {/* The date rides in the label so the value stays a bare figure,
                aligned with the other three. */}
            <StatCard
              label={
                biggestDay ? `Biggest day (${biggestDay.date})` : "Biggest day"
              }
              value={formatCurrency(biggestDay?.total ?? 0)}
            />
          </div>

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Spend by day and category
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              One segment per receipt, coloured by category. Hover a day to see
              what it was made of.
            </p>
            <DailyReceiptBarChart
              receipts={receipts}
              priceKey={pcol}
              colorMap={colorMap}
              height={340}
            />
          </div>

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Receipts
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Sort by any column — click {plabel.replace(" ($)", "")} to find
              the days you spent the most. The footer totals whatever the
              filters here leave on screen.
            </p>
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
