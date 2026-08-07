"use client";

import { useMemo } from "react";

import { FilterBar } from "@/components/filter-bar";
import { DailyReceiptBarChart } from "@/components/charts/daily-receipt-bar-chart";
import { StatCard } from "@/components/charts/stat-card";
import { ReceiptsTable } from "@/components/receipts-table";
import { Separator } from "@/components/ui/separator";
import { useFilteredReceipts } from "@/hooks/use-filtered-receipts";
import { formatCurrency } from "@/lib/format";
import { daysBetween } from "@/lib/dates";
import { APP_ICON, APP_TITLE } from "@/lib/config";

/**
 * The landing page — the daily breakdown.
 *
 * It used to be a separate "Overview" (per-day totals, top ten receipts) with
 * the breakdown a click away, which meant the page you actually wanted was
 * never the one you landed on. The overview's two figures worth keeping —
 * average per day and total refunded — moved into the stat row here, and
 * `/daily` now redirects to `/`.
 */
export default function DailyPage() {
  const { receipts, isLoading, error, filters, plabel, plabelShort, colorMap, pcol } =
    useFilteredReceipts();

  // Every receipt the filters matched, including the fully-refunded ones the
  // chart drops as zero-height segments — the figure has to agree with the
  // table below it, which lists them.
  const totalSpend = receipts.reduce((sum, r) => sum + r[pcol], 0);
  // Per *receipt* and per *day* both, since this is the only page that answers
  // either now. Per-receipt is the one that survives scoping down to a single
  // category — "the average gift costs this much". Both divide by a count the
  // `receipts.length > 0` gate below already guarantees is non-zero.
  const avgPerReceipt = receipts.length > 0 ? totalSpend / receipts.length : 0;
  const dateRangeDays = daysBetween(filters.startDate, filters.endDate) + 1;
  const avgPerDay = dateRangeDays > 0 ? totalSpend / dateRangeDays : 0;
  const totalRefunded = receipts.reduce((sum, r) => sum + r.total_refunded, 0);

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
        {APP_ICON} {APP_TITLE} — Daily Breakdown
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
          {/* Six across only at `xl`. Three of these labels carry a
              parenthetical, and six tracks in a 1280px container is ~200px
              each — enough for the figure, not for the label plus a date. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {/* No "($)" here: the value beside it is already a currency
                figure, so the suffix only repeated the dollar sign. */}
            <StatCard
              label={`Total (${plabelShort})`}
              value={formatCurrency(totalSpend)}
            />
            <StatCard label="Receipts" value={receipts.length} />
            <StatCard label="Avg / day" value={formatCurrency(avgPerDay)} />
            <StatCard
              label="Avg / receipt"
              value={formatCurrency(avgPerReceipt)}
            />
            <StatCard
              label="Total refunded"
              value={formatCurrency(totalRefunded)}
            />
            {/* The date rides in the label so the value stays a bare figure,
                aligned with the other five. */}
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
              Sort by any column — click {plabelShort} to find the days you
              spent the most. The footer totals whatever the filters here leave
              on screen.
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
