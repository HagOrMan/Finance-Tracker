"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_DATE_RANGE_DAYS, DEFAULT_SUBTRACT_REFUNDS } from "@/lib/config";
import {
  DEFAULT_DISBURSEMENT_TYPE,
  defaultFilters,
  type DisbursementType,
  type Filters,
} from "@/lib/filters";

/**
 * Every value `resetFilters` restores, in one place.
 *
 * The initial state and the reset are the *same expression*, so they cannot
 * drift — the bug where "Reset" quietly restores a slightly different default
 * than a first visit does is designed out rather than tested for.
 *
 * Re-evaluated on each call, which matters: `defaultFilters` computes the range
 * from today, so resetting at 11pm and resetting at 1am give different (and
 * both correct) dates.
 */
function defaultFilterState() {
  return {
    ...defaultFilters(DEFAULT_DATE_RANGE_DAYS, DEFAULT_SUBTRACT_REFUNDS),
    entities: [] as string[],
    disbursementType: DEFAULT_DISBURSEMENT_TYPE,
  };
}

interface FiltersState extends Filters {
  // Disbursement-side filters, only rendered by /disbursements — kept in the
  // same store so they persist across visits like every other filter.
  entities: string[];
  disbursementType: DisbursementType;
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
  setDisbursementType: (v: DisbursementType) => void;
  setHasDiscount: (v: Filters["hasDiscount"]) => void;
  setSubtractRefunds: (v: boolean) => void;
  /**
   * Back to a first-visit view — **all** filters, not just this page's.
   *
   * Deliberately global. The filters are one persisted object shared across
   * pages, so a per-page reset would leave the bar on `/daily` claiming
   * everything is cleared while `/disbursements` was still scoped to one
   * entity. The button that calls this says "Reset filters", not "Reset this
   * page".
   */
  resetFilters: () => void;
}

export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      ...defaultFilterState(),
      hasHydrated: false,
      setStartDate: (v) => set({ startDate: v }),
      setEndDate: (v) => set({ endDate: v }),
      setDateRange: (start, end) => set({ startDate: start, endDate: end }),
      setCategories: (v) => set({ categories: v }),
      setStores: (v) => set({ stores: v }),
      setEntities: (v) => set({ entities: v }),
      setDisbursementType: (v) => set({ disbursementType: v }),
      setHasDiscount: (v) => set({ hasDiscount: v }),
      setSubtractRefunds: (v) => set({ subtractRefunds: v }),
      // Note it does not touch `hasHydrated`: that flag reports on this tab's
      // lifecycle and is already true by the time anyone can press the button.
      resetFilters: () => set(defaultFilterState()),
    }),
    {
      name: "finance-tracker-filters",
      // Deferred: Next.js SSR has no localStorage, so auto-rehydrating during
      // store creation would render defaults on the server and something
      // different on the client. FiltersHydrator (in the root layout) calls
      // `.persist.rehydrate()` once, client-side, after mount instead.
      skipHydration: true,
      /**
       * What survives a reload — deliberately **not the date range**.
       *
       * Every other filter answers "what am I interested in", which doesn't
       * change between visits. The dates answer "how recent", and the answer is
       * almost always "up to now": a persisted `endDate` is a snapshot of
       * whenever you last opened the app, so coming back next week silently
       * hides the week you came back to see. Left out, the store's initial state
       * — `defaultFilters`, a trailing window ending today — stands on every
       * load, which is also what the presets and the Reset button mean by a date
       * range. Changing them still sticks while the tab is open; it just doesn't
       * outlive it.
       *
       * `hasHydrated` is excluded for a different reason: written here it would
       * be merged back in *over* the true value on the next rehydrate, and the
       * flag would fight the thing it reports on.
       */
      partialize: (s) => ({
        categories: s.categories,
        stores: s.stores,
        entities: s.entities,
        disbursementType: s.disbursementType,
        hasDiscount: s.hasDiscount,
        subtractRefunds: s.subtractRefunds,
      }),
      /**
       * The reading half of the rule above, and the half that actually enforces
       * it. `partialize` only stops the dates being *written*; every browser
       * that used the app before this change still has a stored `endDate` in
       * localStorage, and zustand's default merge is a shallow spread that would
       * put it straight back. Dropping the keys here means a stale entry decays
       * on its own — first load ignores the dates, and the next write drops them
       * from storage for good.
       */
      merge: (persisted, current) => {
        // Spreading null/undefined is legal and yields {}, so this covers an
        // empty or corrupt entry without a guard.
        const stored = { ...(persisted as Partial<FiltersState>) };
        delete stored.startDate;
        delete stored.endDate;
        return { ...current, ...stored };
      },
    }
  )
);
