import type { Disbursement, MergedReceipt } from "@/lib/data/types";
import { isExcludedCategory } from "@/lib/reports";

export interface Filters {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  categories: string[];
  stores: string[];
  hasDiscount: "Any" | "Yes" | "No";
  subtractRefunds: boolean;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultFilters(defaultRangeDays: number, subtractRefunds: boolean): Filters {
  return {
    startDate: daysAgoISO(defaultRangeDays - 1),
    endDate: todayISO(),
    categories: [],
    stores: [],
    hasDiscount: "Any",
    subtractRefunds,
  };
}

/**
 * The date-range quick-picks in the filter bar.
 *
 * **Trailing windows, not calendar ones** — "this month" on the 2nd is two days
 * of data, which compares badly against anything. Same shape and the same
 * 7/30/365 as `REPORT_PERIODS`, so "past year" means the same span on `/daily`
 * as it does on `/reports`.
 *
 * One deliberate difference from a report window, which ends *yesterday* so it
 * never counts a day still being spent: a preset ends **today**. A filter is
 * something you look through, not a figure you compare against a baseline, and
 * a range that silently omitted this morning's receipts would read as a bug.
 */
export interface DateRangePreset {
  label: string;
  title: string;
  days: number;
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { label: "7d", title: "The last 7 days, ending today", days: 7 },
  { label: "30d", title: "The last 30 days, ending today", days: 30 },
  { label: "90d", title: "The last 90 days, ending today", days: 90 },
  { label: "1y", title: "The last 365 days, ending today", days: 365 },
];

/**
 * `days - 1` back from today, inclusive of today — matching `defaultFilters`, so
 * "7d" is seven days of data rather than eight.
 */
export function presetRange(days: number): { startDate: string; endDate: string } {
  return { startDate: daysAgoISO(days - 1), endDate: todayISO() };
}

/**
 * Which preset the current range *is*, if any, so the bar can show which one is
 * in effect. Matched by recomputing rather than by storing "the active preset":
 * pressing a preset writes two plain dates and nothing remembers it happened,
 * which is the same rule the category presets follow — there is no second,
 * invisible piece of filter state to reason about. Nudge either date by a day
 * and no button is highlighted, correctly.
 */
export function activePresetDays(startDate: string, endDate: string): number | null {
  for (const { days } of DATE_RANGE_PRESETS) {
    const range = presetRange(days);
    if (range.startDate === startDate && range.endDate === endDate) return days;
  }
  return null;
}

// All date comparisons are plain "YYYY-MM-DD" string comparisons — that
// ordering is lexicographically identical to chronological ordering for
// zero-padded ISO dates, and avoids `new Date(...)` timezone parsing bugs.
export function applyFilters(
  rows: MergedReceipt[],
  filters: Filters
): MergedReceipt[] {
  return rows.filter((r) => {
    if (r.date < filters.startDate || r.date > filters.endDate) return false;
    if (filters.categories.length && !filters.categories.includes(r.category))
      return false;
    if (filters.stores.length && !filters.stores.includes(r.store)) return false;

    const hasDiscount = r.discount > 0 || r.discount_percentage > 0;
    if (filters.hasDiscount === "Yes" && !hasDiscount) return false;
    if (filters.hasDiscount === "No" && hasDiscount) return false;

    return true;
  });
}

/**
 * The disbursements-side axis: is this money a **refund** against a receipt, or
 * **standalone** income?
 *
 * Lives here rather than on `Filters` because it filters the other table — the
 * receipt filters above have nothing to say about it. `/disbursements` is the
 * only page that renders the control, and the store persists it alongside
 * `entities` for the same reason.
 */
export type DisbursementType = "All" | "Refund" | "Standalone";

export const DEFAULT_DISBURSEMENT_TYPE: DisbursementType = "All";

// `refunded_from_receipt` being non-null is the *definition* of a refund
// throughout the app — same predicate `mergeReceipts` uses to build
// `total_refunded`. There is no separate "kind" column to disagree with.
export function matchesDisbursementType(
  d: Pick<Disbursement, "refunded_from_receipt">,
  type: DisbursementType,
): boolean {
  if (type === "Refund") return d.refunded_from_receipt != null;
  if (type === "Standalone") return d.refunded_from_receipt == null;
  return true;
}

/**
 * The "Common spending" preset: every category in the data except the ones the
 * spending report holds out of its comparisons (`Travel`, `School`, `Rent`).
 *
 * **A snapshot, not a rule.** It writes a concrete selection into the category
 * filter, so what you see in the control is exactly what is being filtered on,
 * and a category added to the ledger later is not silently swept in — press the
 * preset again. The report's own exclusion is live, and that difference is
 * deliberate: a report is generated fresh every time, a filter is something you
 * left set weeks ago.
 *
 * It reuses the report's own `isExcludedCategory` rather than re-deriving the
 * list — that function already normalizes through `nameGroupKey`, so " rent"
 * and "RENT" are excluded here too, and "same as the email" stays true by
 * construction instead of by two lists agreeing.
 */
export function commonSpendingCategories(options: string[]): string[] {
  return options.filter((c) => !isExcludedCategory(c));
}

export function priceKey(filters: Filters): "actual_price" | "price" {
  return filters.subtractRefunds ? "actual_price" : "price";
}

export function priceLabel(filters: Filters): string {
  return `${priceLabelShort(filters)} ($)`;
}

/**
 * The same label without the `($)` suffix, for places that already read as
 * prose rather than as a column header — "Total (Net paid)", "click Net paid to
 * sort". Derived from one string so the two can't drift.
 */
export function priceLabelShort(filters: Filters): string {
  return filters.subtractRefunds ? "Net paid" : "Gross paid";
}
