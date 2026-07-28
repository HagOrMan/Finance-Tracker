"use client";

import { useId, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterShell } from "@/components/filter-shell";
import { MultiSelect } from "@/components/multi-select";
import { useFiltersStore } from "@/store/filters-store";
import {
  useMergedReceipts,
  useRefreshFinanceData,
} from "@/hooks/use-finance-data";
import type { Filters } from "@/lib/filters";

/**
 * The shared filter row.
 *
 * Every page that filters by category / store / discount uses this, and they
 * differ in exactly one control: most scope by a **date range**, `/monthly`
 * scopes by a **month multiselect**. That control is the `leading` prop; the
 * rest of the row — and the active-filter count the collapsed mobile bar shows
 * — is identical and lives here once.
 *
 * `/disbursements` deliberately keeps its own bar. Its filter set is different
 * rather than merely reordered (date range + entities, no category, store,
 * discount or net-paid), so folding it in would mean making almost every
 * control optional, which costs more than the duplication saves.
 */
export function FilterBar({
  /** Replaces the date-range inputs. Omit for the default date-range bar. */
  leading,
}: {
  leading?: ReactNode;
} = {}) {
  const { data: receipts } = useMergedReceipts();
  const refresh = useRefreshFinanceData();
  // Unique per instance so the label still targets the right box if two bars
  // ever render at once — the pages used to hand-pick ids to avoid colliding.
  const netPaidId = useId();

  const startDate = useFiltersStore((s) => s.startDate);
  const endDate = useFiltersStore((s) => s.endDate);
  const categories = useFiltersStore((s) => s.categories);
  const stores = useFiltersStore((s) => s.stores);
  const hasDiscount = useFiltersStore((s) => s.hasDiscount);
  const subtractRefunds = useFiltersStore((s) => s.subtractRefunds);
  const setDateRange = useFiltersStore((s) => s.setDateRange);
  const setCategories = useFiltersStore((s) => s.setCategories);
  const setStores = useFiltersStore((s) => s.setStores);
  const setHasDiscount = useFiltersStore((s) => s.setHasDiscount);
  const setSubtractRefunds = useFiltersStore((s) => s.setSubtractRefunds);

  const categoryOptions = [
    ...new Set((receipts ?? []).map((r) => r.category)),
  ].sort();
  const storeOptions = [
    ...new Set((receipts ?? []).map((r) => r.store)),
  ].sort();

  // Only what's actually narrowing the view — the date range is always set and
  // "Net paid" is a display toggle, so counting either would leave the
  // collapsed bar permanently showing a badge that means nothing.
  const activeCount =
    (categories.length > 0 ? 1 : 0) +
    (stores.length > 0 ? 1 : 0) +
    (hasDiscount !== "Any" ? 1 : 0);

  return (
    <FilterShell activeCount={activeCount}>
      {leading ?? (
        <div className="flex flex-col gap-1">
          <Label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="filter-start"
          >
            Date range
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="filter-start"
              type="date"
              value={startDate}
              onChange={(e) => setDateRange(e.target.value, endDate)}
              className="w-37.5 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setDateRange(startDate, e.target.value)}
              className="w-37.5 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
            />
          </div>
        </div>
      )}

      <MultiSelect
        label="Category"
        options={categoryOptions}
        selected={categories}
        onChange={setCategories}
        className="w-50 max-sm:w-full"
      />

      <MultiSelect
        label="Store"
        options={storeOptions}
        selected={stores}
        onChange={setStores}
        className="w-50 max-sm:w-full"
      />

      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium text-muted-foreground">
          Has discount
        </Label>
        <Select
          value={hasDiscount}
          onValueChange={(v) => setHasDiscount(v as Filters["hasDiscount"])}
        >
          <SelectTrigger className="w-27.5 max-sm:w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Any">Any</SelectItem>
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Toggle and refresh share a row. In the stacked mobile column that
          reads as a footer to the filters; on desktop it's just the last two
          items of the wrap, where they sat anyway. */}
      <div className="flex items-center gap-2 pb-2 max-sm:justify-between max-sm:pb-0">
        <div className="flex items-center gap-2">
          <Checkbox
            id={netPaidId}
            checked={subtractRefunds}
            onCheckedChange={(v) => setSubtractRefunds(v === true)}
          />
          <Label htmlFor={netPaidId}>Net paid</Label>
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
    </FilterShell>
  );
}
