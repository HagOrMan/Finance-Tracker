"use client";

import { FilterBar } from "@/components/filter-bar";
import { DailyReceiptBarChart } from "@/components/charts/daily-receipt-bar-chart";
import { ReceiptsTable } from "@/components/receipts-table";
import { Separator } from "@/components/ui/separator";
import { useFilteredReceipts } from "@/hooks/use-filtered-receipts";

export default function DailyPage() {
  const { receipts, isLoading, error, plabel, colorMap, pcol } = useFilteredReceipts();

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
