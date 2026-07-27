"use client";

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
import { MultiSelect } from "@/components/multi-select";
import { useFiltersStore } from "@/store/filters-store";
import {
  useMergedReceipts,
  useRefreshFinanceData,
} from "@/hooks/use-finance-data";
import type { Filters } from "@/lib/filters";

export function FilterBar() {
  const { data: receipts } = useMergedReceipts();
  const refresh = useRefreshFinanceData();

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

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
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
            className="w-37.5"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setDateRange(startDate, e.target.value)}
            className="w-37.5"
          />
        </div>
      </div>

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
          id="net-paid"
          checked={subtractRefunds}
          onCheckedChange={(v) => setSubtractRefunds(v === true)}
        />
        <Label htmlFor="net-paid">Net paid</Label>
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
  );
}
