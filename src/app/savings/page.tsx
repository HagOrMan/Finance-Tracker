"use client";

import { useMemo } from "react";

import { FilterBar } from "@/components/filter-bar";
import { StatCard } from "@/components/charts/stat-card";
import { SingleSeriesBarChart } from "@/components/charts/single-series-bar-chart";
import {
  CumulativeExtrapolationChart,
  type CumulativeDatum,
} from "@/components/charts/cumulative-extrapolation-chart";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFilteredReceipts } from "@/hooks/use-filtered-receipts";
import { computeSavings } from "@/lib/savings";
import { formatCurrency } from "@/lib/format";
import { addDaysISO, daysBetween, isoWeekStart } from "@/lib/dates";
import { EXTRAPOLATION_FORWARD_DAYS } from "@/lib/config";

export default function SavingsPage() {
  const { receipts, isLoading, error, filters, pcol, plabel, colorMap } =
    useFilteredReceipts();

  const dateRangeDays = daysBetween(filters.startDate, filters.endDate) + 1;

  const withSavings = useMemo(
    () => receipts.map((r) => ({ ...r, savings: computeSavings(r) })),
    [receipts]
  );

  const totalSavings = withSavings.reduce((s, r) => s + r.savings, 0);
  const totalSpend = receipts.reduce((s, r) => s + r[pcol], 0);
  const numWithDiscount = receipts.filter(
    (r) => r.discount > 0 || r.discount_percentage > 0
  ).length;
  const savingsRate =
    totalSpend + totalSavings > 0
      ? (totalSavings / (totalSpend + totalSavings)) * 100
      : null;

  const savingsOverTime = useMemo(() => {
    const useWeekly = dateRangeDays > 60;
    const byBucket = new Map<string, number>();
    for (const r of withSavings) {
      const bucket = useWeekly ? isoWeekStart(r.date) : r.date;
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + r.savings);
    }
    return [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([x, y]) => ({ x, y }));
  }, [withSavings, dateRangeDays]);

  const savingsByCategory = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const r of withSavings) {
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.savings);
    }
    return [...byCat.entries()].map(([x, y]) => ({ x, y }));
  }, [withSavings]);

  const avgPerDay = dateRangeDays > 0 ? totalSpend / dateRangeDays : 0;

  const cumulativeData = useMemo<CumulativeDatum[]>(() => {
    const byDay = new Map<string, number>();
    for (const r of receipts) {
      byDay.set(r.date, (byDay.get(r.date) ?? 0) + r[pcol]);
    }
    const days = [...byDay.keys()].sort();
    if (days.length === 0) return [];

    let running = 0;
    const actualPoints: CumulativeDatum[] = days.map((d) => {
      running += byDay.get(d)!;
      return { bucket: d, Actual: running };
    });

    const lastDay = days[days.length - 1]!;
    const lastCum = running;
    const merged = actualPoints.map((p, i) =>
      i === actualPoints.length - 1 ? { ...p, Extrapolation: lastCum } : p
    );
    const extrapolationPoints: CumulativeDatum[] = Array.from(
      { length: EXTRAPOLATION_FORWARD_DAYS },
      (_, i) => ({
        bucket: addDaysISO(lastDay, i + 1),
        Extrapolation: lastCum + avgPerDay * (i + 1),
      })
    );

    return [...merged, ...extrapolationPoints];
  }, [receipts, pcol, avgPerDay]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">💰 Savings & Extrapolation</h1>

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Total savings" value={formatCurrency(totalSavings)} />
            <StatCard label="Receipts with discount" value={numWithDiscount} />
            <StatCard
              label="Savings rate"
              value={savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "—"}
            />
          </div>

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">Savings over time</h2>
            <SingleSeriesBarChart
              data={savingsOverTime}
              color="var(--color-primary)"
              seriesName="Savings"
            />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">Savings by category</h2>
            <SingleSeriesBarChart
              data={savingsByCategory}
              colorMap={colorMap}
              seriesName="Savings"
            />
          </div>

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">Spend extrapolation</h2>
            <Table className="mb-4 max-w-md">
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Projected spend ({plabel})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Day</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(avgPerDay)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Week</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(avgPerDay * 7)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Month (30 days)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(avgPerDay * 30)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <CumulativeExtrapolationChart data={cumulativeData} />
          </div>
        </>
      )}
    </div>
  );
}
