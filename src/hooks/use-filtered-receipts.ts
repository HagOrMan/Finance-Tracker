"use client";

import { useMemo } from "react";

import { useMergedReceipts } from "@/hooks/use-finance-data";
import { useCategoryColors } from "@/hooks/use-category-colors";
import { useFiltersStore } from "@/store/filters-store";
import { applyFilters, priceKey, priceLabel } from "@/lib/filters";

export function useFilteredReceipts() {
  const { data, isLoading, error } = useMergedReceipts();
  // Select only the fields applyFilters reads — not the whole store — so a
  // change to `entities` (disbursements-only) doesn't force every other
  // page's applyFilters memo to recompute.
  const startDate = useFiltersStore((s) => s.startDate);
  const endDate = useFiltersStore((s) => s.endDate);
  const categories = useFiltersStore((s) => s.categories);
  const stores = useFiltersStore((s) => s.stores);
  const hasDiscount = useFiltersStore((s) => s.hasDiscount);
  const subtractRefunds = useFiltersStore((s) => s.subtractRefunds);
  const hasHydrated = useFiltersStore((s) => s.hasHydrated);
  const filters = useMemo(
    () => ({ startDate, endDate, categories, stores, hasDiscount, subtractRefunds }),
    [startDate, endDate, categories, stores, hasDiscount, subtractRefunds]
  );
  const allReceipts = useMemo(() => data ?? [], [data]);

  const receipts = useMemo(
    () => applyFilters(allReceipts, filters),
    [allReceipts, filters]
  );

  const allCategories = useMemo(
    () => [...new Set(allReceipts.map((r) => r.category))],
    [allReceipts]
  );
  const colorMap = useCategoryColors(allCategories);

  return {
    allReceipts,
    receipts,
    // Folds the filter store's hydration into the same flag pages already gate
    // on. Before it flips, `filters` holds defaults rather than the user's
    // saved values, so `receipts` is a real list filtered by the wrong range —
    // which renders as numbers that visibly change a frame later. "Not ready"
    // is the honest description of that state, and every page already handles
    // it.
    isLoading: isLoading || !hasHydrated,
    error,
    filters,
    pcol: priceKey(filters),
    plabel: priceLabel(filters),
    colorMap,
  };
}
