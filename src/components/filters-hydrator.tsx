"use client";

import { useEffect } from "react";

import { useFiltersStore } from "@/store/filters-store";

/**
 * Reads the persisted filters out of localStorage, once, after mount.
 *
 * The store is created with `skipHydration` because Next.js renders it on a
 * server with no localStorage — hydrating during store creation would produce
 * different markup on each side. This runs in the root layout instead.
 *
 * It then flips `hasHydrated`, which is the part consumers care about: until it
 * is true, every filter in the store is a *default*, so anything derived from
 * them is derived from the wrong values. Flipping it after `rehydrate()`
 * resolves — rather than relying on `onRehydrateStorage`'s ordering — keeps the
 * sequence readable, and works the same when storage is empty, where rehydrate
 * simply leaves the defaults in place.
 *
 * ⚠️ **This must stay mounted in the root layout.** It looks inert — it renders
 * `null` — but pages now gate their content on `hasHydrated`, so deleting it
 * leaves the flag false forever and every filtered page stuck on "Loading…".
 */
export function FiltersHydrator() {
  useEffect(() => {
    // `rehydrate()` is sync against localStorage but typed as possibly async,
    // since a custom storage adapter needn't be.
    void Promise.resolve(useFiltersStore.persist.rehydrate()).then(() => {
      useFiltersStore.setState({ hasHydrated: true });
    });
  }, []);

  return null;
}
