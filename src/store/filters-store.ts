"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_DATE_RANGE_DAYS, DEFAULT_SUBTRACT_REFUNDS } from "@/lib/config";
import { defaultFilters, type Filters } from "@/lib/filters";

interface FiltersState extends Filters {
  // Disbursement-side filter, only rendered by /disbursements — kept in the
  // same store so it persists across visits like every other filter.
  entities: string[];
  /**
   * False until `FiltersHydrator` has read localStorage.
   *
   * Every value above is a *default* until this flips, so anything computed
   * from them before then is computed from the wrong filters. Consumers that
   * render numbers must wait — `useFilteredReceipts` folds this into its
   * `isLoading`, which is how most pages get it for free.
   *
   * Deliberately not persisted (see `partialize`): it describes this tab's
   * lifecycle, not the user's filters.
   */
  hasHydrated: boolean;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setDateRange: (start: string, end: string) => void;
  setCategories: (v: string[]) => void;
  setStores: (v: string[]) => void;
  setEntities: (v: string[]) => void;
  setHasDiscount: (v: Filters["hasDiscount"]) => void;
  setSubtractRefunds: (v: boolean) => void;
}

export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      ...defaultFilters(DEFAULT_DATE_RANGE_DAYS, DEFAULT_SUBTRACT_REFUNDS),
      entities: [],
      hasHydrated: false,
      setStartDate: (v) => set({ startDate: v }),
      setEndDate: (v) => set({ endDate: v }),
      setDateRange: (start, end) => set({ startDate: start, endDate: end }),
      setCategories: (v) => set({ categories: v }),
      setStores: (v) => set({ stores: v }),
      setEntities: (v) => set({ entities: v }),
      setHasDiscount: (v) => set({ hasDiscount: v }),
      setSubtractRefunds: (v) => set({ subtractRefunds: v }),
    }),
    {
      name: "finance-tracker-filters",
      // Deferred: Next.js SSR has no localStorage, so auto-rehydrating during
      // store creation would render defaults on the server and something
      // different on the client. FiltersHydrator (in the root layout) calls
      // `.persist.rehydrate()` once, client-side, after mount instead.
      skipHydration: true,
      // Only the filters themselves. Without this, `hasHydrated: false` would
      // be written to storage and then merged back in *over* the true value on
      // the next rehydrate — the flag would fight the thing it reports on.
      partialize: (s) => ({
        startDate: s.startDate,
        endDate: s.endDate,
        categories: s.categories,
        stores: s.stores,
        entities: s.entities,
        hasDiscount: s.hasDiscount,
        subtractRefunds: s.subtractRefunds,
      }),
    }
  )
);
