"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { MultiSelect } from "@/components/multi-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/charts/stat-card";
import { StackedCategoryBarChart } from "@/components/charts/stacked-category-bar-chart";
import { CategoryLineChart } from "@/components/charts/category-line-chart";
import { CategoryMonthHeatmap } from "@/components/charts/category-month-heatmap";
import { ReceiptsTable } from "@/components/receipts-table";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useMergedReceipts,
  useRefreshFinanceData,
} from "@/hooks/use-finance-data";
import { useCategoryColors } from "@/hooks/use-category-colors";
import { useFiltersStore } from "@/store/filters-store";
import { formatCurrency } from "@/lib/format";
import type { Filters } from "@/lib/filters";

function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export default function MonthlyPage() {
  const { data, isLoading, error } = useMergedReceipts();
  const refresh = useRefreshFinanceData();
  const allReceipts = useMemo(() => data ?? [], [data]);

  const categories = useFiltersStore((s) => s.categories);
  const stores = useFiltersStore((s) => s.stores);
  const hasDiscount = useFiltersStore((s) => s.hasDiscount);
  const subtractRefunds = useFiltersStore((s) => s.subtractRefunds);
  const setCategories = useFiltersStore((s) => s.setCategories);
  const setStores = useFiltersStore((s) => s.setStores);
  const setHasDiscount = useFiltersStore((s) => s.setHasDiscount);
  const setSubtractRefunds = useFiltersStore((s) => s.setSubtractRefunds);

  const pcol = subtractRefunds ? "actual_price" : "price";
  const plabel = subtractRefunds ? "Net paid ($)" : "Gross paid ($)";

  const allMonthsDesc = useMemo(
    () =>
      [...new Set(allReceipts.map((r) => monthOf(r.date)))].sort().reverse(),
    [allReceipts],
  );

  const [selectedMonths, setSelectedMonths] = useState<string[] | null>(null);
  const effectiveMonths = selectedMonths ?? allMonthsDesc.slice(0, 6);
  const monthsChrono = useMemo(
    () => [...effectiveMonths].sort(),
    [effectiveMonths],
  );

  const categoryOptions = useMemo(
    () => [...new Set(allReceipts.map((r) => r.category))].sort(),
    [allReceipts],
  );
  const storeOptions = useMemo(
    () => [...new Set(allReceipts.map((r) => r.store))].sort(),
    [allReceipts],
  );
  const colorMap = useCategoryColors(categoryOptions);

  const filtered = useMemo(() => {
    return allReceipts.filter((r) => {
      if (!effectiveMonths.includes(monthOf(r.date))) return false;
      if (categories.length && !categories.includes(r.category)) return false;
      if (stores.length && !stores.includes(r.store)) return false;
      const hd = r.discount > 0 || r.discount_percentage > 0;
      if (hasDiscount === "Yes" && !hd) return false;
      if (hasDiscount === "No" && hd) return false;
      return true;
    });
  }, [allReceipts, effectiveMonths, categories, stores, hasDiscount]);

  const totalSpend = filtered.reduce((s, r) => s + r[pcol], 0);
  const avgPerMonth = effectiveMonths.length
    ? totalSpend / effectiveMonths.length
    : 0;
  const totalRefunded = filtered.reduce((s, r) => s + r.total_refunded, 0);

  const stackedData = useMemo(() => {
    const byMonth = new Map<string, Record<string, string | number>>();
    for (const m of monthsChrono) byMonth.set(m, { bucket: m });
    for (const r of filtered) {
      const row = byMonth.get(monthOf(r.date));
      if (!row) continue;
      row[r.category] = (Number(row[r.category]) || 0) + r[pcol];
    }
    return monthsChrono.map((m) => byMonth.get(m)!);
  }, [filtered, monthsChrono, pcol]);

  const chartCategories = useMemo(
    () => [...new Set(filtered.map((r) => r.category))].sort(),
    [filtered],
  );

  const receiptsByMonth = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of monthsChrono) map.set(m, []);
    for (const r of filtered) {
      map.get(monthOf(r.date))?.push(r);
    }
    return map;
  }, [filtered, monthsChrono]);

  const [trendCategoryFilter, setTrendCategoryFilter] = useState<string[]>([]);
  const trendReceipts = useMemo(
    () =>
      trendCategoryFilter.length
        ? filtered.filter((r) => trendCategoryFilter.includes(r.category))
        : filtered,
    [filtered, trendCategoryFilter],
  );
  const trendCategories = useMemo(
    () => [...new Set(trendReceipts.map((r) => r.category))].sort(),
    [trendReceipts],
  );

  const lineData = useMemo(() => {
    const byMonth = new Map<string, Record<string, string | number>>();
    for (const m of monthsChrono) byMonth.set(m, { bucket: m });
    for (const r of trendReceipts) {
      const row = byMonth.get(monthOf(r.date));
      if (!row) continue;
      row[r.category] = (Number(row[r.category]) || 0) + r[pcol];
    }
    return monthsChrono.map((m) => byMonth.get(m)!);
  }, [trendReceipts, monthsChrono, pcol]);

  const heatmapValues = useMemo(() => {
    const values: Record<string, Record<string, number>> = {};
    for (const r of trendReceipts) {
      const m = monthOf(r.date);
      values[r.category] ??= {};
      values[r.category][m] = (values[r.category][m] ?? 0) + r[pcol];
    }
    return values;
  }, [trendReceipts, pcol]);

  const heatmapCategories = useMemo(
    () =>
      [...trendCategories].sort(
        (a, b) =>
          monthsChrono.reduce((s, m) => s + (heatmapValues[b]?.[m] ?? 0), 0) -
          monthsChrono.reduce((s, m) => s + (heatmapValues[a]?.[m] ?? 0), 0),
      ),
    [trendCategories, monthsChrono, heatmapValues],
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">
        📆 Monthly Breakdown
      </h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <MultiSelect
          label="Months (any, non-consecutive ok)"
          options={allMonthsDesc}
          selected={effectiveMonths}
          onChange={setSelectedMonths}
          className="w-65"
        />
        <MultiSelect
          label="Category"
          options={categoryOptions}
          selected={categories}
          onChange={setCategories}
          className="w-50"
        />
        <MultiSelect
          label="Store"
          options={storeOptions}
          selected={stores}
          onChange={setStores}
          className="w-50"
        />
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium text-muted-foreground">
            Has discount
          </Label>
          <Select
            value={hasDiscount}
            onValueChange={(v) => setHasDiscount(v as Filters["hasDiscount"])}
          >
            <SelectTrigger className="w-27.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Any">Any</SelectItem>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="monthly-net-paid"
            checked={subtractRefunds}
            onCheckedChange={(v) => setSubtractRefunds(v === true)}
          />
          <Label htmlFor="monthly-net-paid">Net paid</Label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={refresh}
          aria-label="Refresh data"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && effectiveMonths.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Select at least one month above to view data.
        </p>
      )}
      {!isLoading && effectiveMonths.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No receipts match the current filters.
        </p>
      )}

      {!isLoading && filtered.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total spend" value={formatCurrency(totalSpend)} />
            <StatCard label="Avg / month" value={formatCurrency(avgPerMonth)} />
            <StatCard label="Receipts" value={filtered.length} />
            <StatCard
              label="Total refunded"
              value={formatCurrency(totalRefunded)}
            />
          </div>

          <Separator />
          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Spend by month and category
            </h2>
            <StackedCategoryBarChart
              data={stackedData}
              categories={chartCategories}
              colorMap={colorMap}
              height={340}
            />
          </div>

          <Separator />
          <div>
            <h2 className="mb-3 text-lg font-medium text-foreground">
              Receipts by month
            </h2>
            <Tabs key={monthsChrono.join(",")} defaultValue={monthsChrono[0]}>
              <TabsList className="h-auto flex-wrap">
                {monthsChrono.map((m) => (
                  <TabsTrigger key={m} value={m}>
                    📋 {m}
                  </TabsTrigger>
                ))}
              </TabsList>
              {monthsChrono.map((m) => {
                const monthReceipts = receiptsByMonth.get(m) ?? [];
                const monthTotal = monthReceipts.reduce(
                  (s, r) => s + r[pcol],
                  0,
                );
                return (
                  <TabsContent key={m} value={m}>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Total:{" "}
                      <span className="font-medium text-foreground">
                        {formatCurrency(monthTotal)}
                      </span>{" "}
                      — {monthReceipts.length} receipts
                    </p>
                    <ReceiptsTable
                      receipts={monthReceipts}
                      priceKey={pcol}
                      priceLabel={plabel}
                      showDiscountColumns
                    />
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          <Separator />
          <div>
            <h2 className="mb-1 text-lg font-medium text-foreground">
              Category trends over months
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Line chart shows spend per category per month. Heatmap highlights
              relative intensity — darker = higher spend.
            </p>
            <MultiSelect
              label="Filter categories (leave empty for all)"
              options={chartCategories}
              selected={trendCategoryFilter}
              onChange={setTrendCategoryFilter}
              className="mb-4 w-65"
            />
            {trendReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No data for selected categories.
              </p>
            ) : (
              <>
                <CategoryLineChart
                  data={lineData}
                  categories={trendCategories}
                  colorMap={colorMap}
                  height={320}
                />
                <h3 className="mt-6 mb-3 text-base font-medium text-foreground">
                  Category x month heatmap
                </h3>
                <CategoryMonthHeatmap
                  categories={heatmapCategories}
                  months={monthsChrono}
                  values={heatmapValues}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
