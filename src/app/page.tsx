"use client";

import { useMemo } from "react";

import { FilterBar } from "@/components/filter-bar";
import { StatCard } from "@/components/charts/stat-card";
import { SingleSeriesBarChart } from "@/components/charts/single-series-bar-chart";
import { ReceiptsTable } from "@/components/receipts-table";
import { Separator } from "@/components/ui/separator";
import { useFilteredReceipts } from "@/hooks/use-filtered-receipts";
import { formatCurrency } from "@/lib/format";
import { daysBetween } from "@/lib/dates";
import { APP_ICON, APP_TITLE } from "@/lib/config";

export default function OverviewPage() {
  const { receipts, isLoading, error, filters, pcol, plabel } = useFilteredReceipts();

  const totalSpend = receipts.reduce((sum, r) => sum + r[pcol], 0);
  const numReceipts = receipts.length;
  const dateRangeDays = daysBetween(filters.startDate, filters.endDate) + 1;
  const avgPerDay = dateRangeDays > 0 ? totalSpend / dateRangeDays : 0;
  const totalRefunded = receipts.reduce((sum, r) => sum + r.total_refunded, 0);

  const spendPerDay = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of receipts) {
      byDay.set(r.date, (byDay.get(r.date) ?? 0) + r[pcol]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([x, y]) => ({ x, y }));
  }, [receipts, pcol]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">
        {APP_ICON} {APP_TITLE} — Overview
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
            <StatCard label="Total spend" value={formatCurrency(totalSpend)} />
            <StatCard label="Receipts" value={numReceipts} />
            <StatCard label="Avg / day" value={formatCurrency(avgPerDay)} />
            <StatCard label="Total refunded" value={formatCurrency(totalRefunded)} />
          </div>

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">Spend per day</h2>
            <SingleSeriesBarChart
              data={spendPerDay}
              color="var(--color-primary)"
              seriesName={plabel}
            />
          </div>

          <Separator />

          <div>
            {/* Not "Recent receipts": the table sorts, and the ten rows are the
                top ten of whatever sort is active — newest first until you
                click a column, biggest first once you click Price. */}
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Top 10 receipts
            </h2>
            <ReceiptsTable receipts={receipts} priceKey={pcol} priceLabel={plabel} limit={10} />
          </div>
        </>
      )}
    </div>
  );
}
