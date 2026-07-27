"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_DATE_RANGE_DAYS, DEFAULT_SUBTRACT_REFUNDS } from "@/lib/config";
import { defaultFilters, type Filters } from "@/lib/filters";

interface FiltersState extends Filters {
  // Disbursement-side filter, only rendered by /disbursements — kept in the
  // same store so it persists across visits like every other filter.
  entities: string[];
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
    }
  )
);
