import type { MergedReceipt } from "@/lib/data/types";

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

export function priceKey(filters: Filters): "actual_price" | "price" {
  return filters.subtractRefunds ? "actual_price" : "price";
}

export function priceLabel(filters: Filters): string {
  return filters.subtractRefunds ? "Net paid ($)" : "Gross paid ($)";
}
