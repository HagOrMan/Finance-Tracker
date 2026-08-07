"use client";

import { useEffect, useState } from "react";

import { IS_DEMO } from "@/lib/demo/flag";

/**
 * Loads the demo dataset before anything renders from it.
 *
 * **The gate is not cosmetic — it is what prevents a hydration mismatch.** The
 * server renders with no `localStorage`, so the demo store is empty there and
 * populated on the client; gating on `ready` makes both sides agree on the
 * boot screen and lets the data appear afterwards.
 *
 * Same shape as `FiltersHydrator`, which solves the identical problem for the
 * persisted filter store — read once in an effect, flip a flag, let consumers
 * wait on the flag. The difference is that this one holds back rendering rather
 * than being folded into a page's `isLoading`, because a page that renders
 * before the store exists doesn't show stale numbers, it throws.
 *
 * In production `ready` starts `true` and this is a pass-through with one
 * `useState`.
 *
 * **The store is imported dynamically, and that is not a micro-optimisation.**
 * This component is mounted on every page in both modes, so a static
 * `import { hydrateDemoStore } from "@/lib/demo/store"` would pull the store —
 * and through it the whole seed generator, PRNG and fictional-world tables —
 * into the production bundle, whatever `IS_DEMO` says. A build-time-false
 * branch removes the *call*, not the *import*. `DemoBanner` does the same.
 *
 * No artificial delay. The work is real and finishes in well under a second; a
 * fake loading bar is exactly the thing a careful visitor notices.
 */
export function DemoBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!IS_DEMO);

  useEffect(() => {
    if (!IS_DEMO) return;
    let cancelled = false;
    void import("@/lib/demo/store")
      .then(({ hydrateDemoStore }) => hydrateDemoStore())
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-3xl" aria-hidden="true">
          💸
        </span>
        <p className="text-sm text-muted-foreground">
          Setting up your demo ledger…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
