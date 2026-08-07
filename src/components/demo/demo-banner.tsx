"use client";

import { useState } from "react";
import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IS_DEMO } from "@/lib/demo/flag";

/**
 * Says what this is, and offers the way out of any mess a visitor makes.
 *
 * **Dismissible, but not persistently.** The dismissal is component state, so
 * it comes back on reload — a visitor who arrives at a later session must not
 * mistake generated data for someone's real finances.
 *
 * **Destructive actions are deliberately left enabled** everywhere in the demo.
 * Deleting things is the point of a sandbox, and this button is the undo.
 *
 * Reset re-seeds and reloads rather than invalidating the query cache: a
 * reload is one line, provably correct, and this is the one action where the
 * cost of being clever exceeds the cost of a page load.
 *
 * The store is imported dynamically for the reason spelled out in `DemoBoot`:
 * this component is mounted on every page in both modes, so a static import
 * would ship the seed generator to production visitors regardless of `IS_DEMO`.
 */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (!IS_DEMO || dismissed) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm">
        <span className="font-medium text-foreground">Demo mode</span>
        <span className="text-muted-foreground">
          Sample data only. Your changes are stored in this browser and no email
          is ever sent.
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void import("@/lib/demo/store").then(({ resetDemoStore }) => {
                resetDemoStore();
                window.location.reload();
              });
            }}
            title="Discard your changes and start from a fresh generated ledger"
          >
            <RotateCcw />
            Reset demo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss the demo notice"
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  );
}
