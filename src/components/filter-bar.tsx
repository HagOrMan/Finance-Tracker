"use client";

import { useId, useMemo, type ReactNode } from "react";

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
import { RefreshButton, ResetFiltersButton } from "@/components/filter-actions";
import { FilterShell } from "@/components/filter-shell";
import { MultiSelect, type MultiSelectPreset } from "@/components/multi-select";
import { useFiltersStore } from "@/store/filters-store";
import { useMergedReceipts } from "@/hooks/use-finance-data";
import {
  activePresetDays,
  commonSpendingCategories,
  DATE_RANGE_PRESETS,
  presetRange,
  type Filters,
} from "@/lib/filters";
import { COMPARISON_EXCLUDED_CATEGORIES } from "@/lib/config";

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
 * rather than merely reordered (date range + entities + refund/standalone, no
 * category, store, discount or net-paid), so folding it in would mean making
 * almost every control optional, which costs more than the duplication saves.
 */
export function FilterBar({
  /** Replaces the date-range inputs. Omit for the default date-range bar. */
  leading,
  /**
   * Page-local filter state to clear when Reset is pressed. Only `/monthly`
   * has any — its month selection, which the store deliberately doesn't hold.
   */
  onReset,
}: {
  leading?: ReactNode;
  onReset?: () => void;
} = {}) {
  const { data: receipts } = useMergedReceipts();
  // Unique per instance so the label still targets the right box if two bars
  // ever render at once — the pages used to hand-pick ids to avoid colliding.
  const netPaidId = useId();

  const categories = useFiltersStore((s) => s.categories);
  const stores = useFiltersStore((s) => s.stores);
  const hasDiscount = useFiltersStore((s) => s.hasDiscount);
  const subtractRefunds = useFiltersStore((s) => s.subtractRefunds);
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

  // The same held-out list the weekly email uses, so "what I actually spend"
  // means one thing in both places. See `commonSpendingCategories`.
  const categoryPresets = useMemo<MultiSelectPreset[]>(
    () => [
      {
        label: "Common spending",
        title: `Select every category except ${COMPARISON_EXCLUDED_CATEGORIES.join(
          ", ",
        )} — the same ones the spending report holds out`,
        select: commonSpendingCategories,
      },
    ],
    [],
  );

  // Only what's actually narrowing the view — the date range is always set and
  // "Net paid" is a display toggle, so counting either would leave the
  // collapsed bar permanently showing a badge that means nothing.
  const activeCount =
    (categories.length > 0 ? 1 : 0) +
    (stores.length > 0 ? 1 : 0) +
    (hasDiscount !== "Any" ? 1 : 0);

  return (
    <FilterShell activeCount={activeCount}>
      {leading ?? <DateRangeField />}

      <MultiSelect
        label="Category"
        options={categoryOptions}
        selected={categories}
        onChange={setCategories}
        presets={categoryPresets}
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

      {/* Toggle and the two actions share a row. In the stacked mobile column
          that reads as a footer to the filters; on desktop it's just the last
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
        <div className="flex items-center gap-2">
          <ResetFiltersButton onReset={onReset} />
          <RefreshButton />
        </div>
      </div>
    </FilterShell>
  );
}

/**
 * The default scope control: two dates, plus quick-picks for the spans actually
 * compared often ("what did I spend on gifts this past year").
 *
 * The presets sit here rather than on `/daily` alone because the date range is
 * the *shared* filter — a preset that only existed on one page would set state
 * every other page reads, from a control they don't have. `/monthly` never
 * renders this (it replaces the whole block via `leading`), so its month
 * multiselect stays the only scope control there, which is the point.
 *
 * Reads the store itself instead of taking props: when a page passes `leading`
 * this component doesn't mount, so those three subscriptions don't exist and a
 * date change can't re-render `/monthly`'s bar.
 */
function DateRangeField() {
  const startDate = useFiltersStore((s) => s.startDate);
  const endDate = useFiltersStore((s) => s.endDate);
  const setDateRange = useFiltersStore((s) => s.setDateRange);

  // Recomputed every render rather than stored — see `activePresetDays`. Also
  // means the highlight is correct across midnight without anything watching
  // the clock: "30d" simply stops matching yesterday's dates.
  const activeDays = activePresetDays(startDate, endDate);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <Label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="filter-start"
        >
          Date range
        </Label>
        {/* Same 24px ghost buttons as the category presets in `MultiSelect`, so
            the two kinds of quick-pick read as one idea. */}
        <div className="flex items-center gap-0.5">
          {DATE_RANGE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant={activeDays === preset.days ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-xs"
              title={preset.title}
              aria-pressed={activeDays === preset.days}
              onClick={() => {
                const range = presetRange(preset.days);
                setDateRange(range.startDate, range.endDate);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
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
  );
}
