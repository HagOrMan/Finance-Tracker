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
  return filters.subtractRefunds ? "Net paid ($)" : "Gross paid ($)";
}
